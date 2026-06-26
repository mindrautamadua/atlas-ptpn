import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { broadcastToUsers } from '@/lib/broadcast'
import {
  requireApiUser, errorResponse, validationError, HttpError,
  requireChannelAccess, getChannelMemberIds, serializeMessage, messageInclude,
  type RawMessage,
} from '@/lib/channels'

export const dynamic = 'force-dynamic'

// ── POST /channels/[id]/messages/[messageId]/reactions — addReaction ──────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  try {
    const user = await requireApiUser()
    const { id, messageId } = await params
    const channelId = Number(id)
    const msgId = Number(messageId)
    const body = await req.json().catch(() => ({}))

    const emoji = typeof body?.emoji === 'string' ? body.emoji : ''
    if (!emoji) throw validationError('The emoji field is required.')
    if (emoji.length > 10) throw validationError('The emoji may not be greater than 10 characters.')

    await requireChannelAccess(channelId, user, true)
    await toggleReaction(channelId, msgId, user.id, emoji, false)

    const fresh = await prisma.channelMessage.findUniqueOrThrow({
      where: { id: msgId },
      include: messageInclude,
    })
    return NextResponse.json({ data: serializeMessage(fresh as unknown as RawMessage) })
  } catch (e) {
    return errorResponse(e)
  }
}

// ── toggleReaction — ChannelMessageController::toggleReaction ─────────────────
async function toggleReaction(
  channelId: number,
  messageId: number,
  userId: number,
  emoji: string,
  remove: boolean,
): Promise<void> {
  const msg = await prisma.channelMessage.findUnique({
    where: { id: messageId },
    select: { reactions: true },
  })
  if (!msg) throw new HttpError(404, 'Message not found.')

  const reactions: Record<string, number[]> =
    (msg.reactions as Record<string, number[]> | null) ?? {}
  let userIds = reactions[emoji] ?? []

  if (remove) {
    userIds = userIds.filter((id) => id !== userId)
  } else if (!userIds.includes(userId)) {
    userIds = [...userIds, userId]
  }

  const next: Record<string, number[]> = { ...reactions }
  if (userIds.length === 0) {
    delete next[emoji]
  } else {
    next[emoji] = userIds
  }

  await prisma.channelMessage.update({
    where: { id: messageId },
    data: { reactions: next },
  })

  const memberIds = await getChannelMemberIds(channelId)
  await broadcastToUsers('channel:reaction:changed', {
    channelId,
    messageId,
    reactions: next,
  }, memberIds)
}
