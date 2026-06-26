import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { broadcastToUsers } from '@/lib/broadcast'
import {
  requireApiUser, errorResponse, validationError, HttpError, isAdminRole,
  getChannelMemberIds, serializeMessage, messageInclude, type RawMessage,
} from '@/lib/channels'

export const dynamic = 'force-dynamic'

// ── PUT /channels/[id]/messages/[messageId] — ChannelMessageController::update ─
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  try {
    const user = await requireApiUser()
    const { id, messageId } = await params
    const channelId = Number(id)
    const msgId = Number(messageId)
    const body = await req.json().catch(() => ({}))

    const content = typeof body?.content === 'string' ? body.content : ''
    if (!content) throw validationError('The content field is required.')
    if (content.length > 10000) throw validationError('The content may not be greater than 10000 characters.')

    const msg = await prisma.channelMessage.findFirst({
      where: { channelId, id: msgId },
      select: { id: true, userId: true },
    })
    if (!msg) throw new HttpError(404, 'Message not found.')

    if (!isAdminRole(user.roleType) && msg.userId !== user.id) {
      throw new HttpError(403, 'Only the sender can edit this message.')
    }

    await prisma.channelMessage.update({
      where: { id: msgId },
      data: {
        content,
        isEdited: true,
        editedAt: new Date(),
        editedBy: user.id,
        searchableText: content.toLowerCase(),
      },
    })

    const fresh = await prisma.channelMessage.findUniqueOrThrow({
      where: { id: msgId },
      include: messageInclude,
    })
    const memberIds = await getChannelMemberIds(channelId)
    await broadcastToUsers('channel:message:updated', {
      channelId,
      message: serializeMessage(fresh as unknown as RawMessage),
    }, memberIds)

    return NextResponse.json({ data: serializeMessage(fresh as unknown as RawMessage) })
  } catch (e) {
    return errorResponse(e)
  }
}

// ── DELETE /channels/[id]/messages/[messageId] — destroy ──────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  try {
    const user = await requireApiUser()
    const { id, messageId } = await params
    const channelId = Number(id)
    const msgId = Number(messageId)
    const body = await req.json().catch(() => ({}))
    const scope = body?.scope ?? 'self'

    const msg = await prisma.channelMessage.findFirst({
      where: { channelId, id: msgId },
      select: { id: true, userId: true, parentMessageId: true },
    })
    if (!msg) throw new HttpError(404, 'Message not found.')

    if (scope === 'self') {
      await prisma.channelMessageHidden.upsert({
        where: { messageId_userId: { messageId: msgId, userId: user.id } },
        create: { messageId: msgId, userId: user.id },
        update: {},
      })
    } else {
      if (!isAdminRole(user.roleType) && msg.userId !== user.id) {
        throw new HttpError(403, 'Only the sender or an admin can delete a message for everyone.')
      }
      await prisma.channelMessage.update({
        where: { id: msgId },
        data: {
          deletedForEveryoneAt: new Date(),
          deletedForEveryoneBy: user.id,
          content: '[Message deleted]',
        },
      })

      const memberIds = await getChannelMemberIds(channelId)
      await broadcastToUsers('channel:message:deleted', {
        channelId,
        messageId: msgId,
        parentMessageId: msg.parentMessageId,
      }, memberIds)
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
