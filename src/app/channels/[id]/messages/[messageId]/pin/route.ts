import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { broadcastToUsers } from '@/lib/broadcast'
import {
  requireApiUser, errorResponse, HttpError,
  requireChannelAccess, getChannelMemberIds, serializeMessage, messageInclude,
  type RawMessage,
} from '@/lib/channels'

export const dynamic = 'force-dynamic'

// ── PUT /channels/[id]/messages/[messageId]/pin — togglePin ───────────────────
export async function PUT(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  try {
    const user = await requireApiUser()
    const { id, messageId } = await params
    const channelId = Number(id)
    const msgId = Number(messageId)
    await requireChannelAccess(channelId, user, true)

    const msg = await prisma.channelMessage.findFirst({
      where: { channelId, id: msgId },
      select: { id: true, isPinned: true },
    })
    if (!msg) throw new HttpError(404, 'Message not found.')

    const newVal = !msg.isPinned
    await prisma.channelMessage.update({
      where: { id: msgId },
      data: { isPinned: newVal },
    })

    const memberIds = await getChannelMemberIds(channelId)
    await broadcastToUsers('channel:message:pinned', {
      channelId,
      messageId: msgId,
      isPinned: newVal,
    }, memberIds)

    const fresh = await prisma.channelMessage.findUniqueOrThrow({
      where: { id: msgId },
      include: messageInclude,
    })
    return NextResponse.json({ data: serializeMessage(fresh as unknown as RawMessage) })
  } catch (e) {
    return errorResponse(e)
  }
}
