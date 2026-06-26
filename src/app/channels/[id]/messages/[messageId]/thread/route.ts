import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import {
  requireApiUser, errorResponse, HttpError,
  requireChannelAccess, serializeMessage, messageInclude, type RawMessage,
} from '@/lib/channels'

export const dynamic = 'force-dynamic'

// ── GET /channels/[id]/messages/[messageId]/thread — thread ───────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  try {
    const user = await requireApiUser()
    const { id, messageId } = await params
    const channelId = Number(id)
    const msgId = Number(messageId)
    await requireChannelAccess(channelId, user, false)

    const hiddenRows = await prisma.channelMessageHidden.findMany({
      where: { userId: user.id },
      select: { messageId: true },
    })
    const hiddenIds = hiddenRows.map((r) => r.messageId)

    const parent = await prisma.channelMessage.findFirst({
      where: { channelId, id: msgId },
      include: messageInclude,
    })
    if (!parent) throw new HttpError(404, 'Message not found.')

    const replies = await prisma.channelMessage.findMany({
      where: {
        channelId,
        parentMessageId: msgId,
        deletedForEveryoneAt: null,
        ...(hiddenIds.length ? { id: { notIn: hiddenIds } } : {}),
      },
      include: messageInclude,
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({
      data: {
        parent: serializeMessage(parent as unknown as RawMessage),
        replies: replies.map((r) => serializeMessage(r as unknown as RawMessage)),
      },
    })
  } catch (e) {
    return errorResponse(e)
  }
}
