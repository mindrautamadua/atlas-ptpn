import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { broadcastToUsers } from '@/lib/broadcast'
import {
  requireApiUser, errorResponse, validationError,
  requireChannelAccess, getChannelMemberIds, serializeMessage,
  messageInclude, isDmName, type RawMessage,
} from '@/lib/channels'

export const dynamic = 'force-dynamic'

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ── GET /channels/[id]/messages — ChannelMessageController::index ─────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser()
    const { id } = await params
    const channelId = Number(id)
    await requireChannelAccess(channelId, user, false)

    const sp = req.nextUrl.searchParams
    const limit = Math.min(Number(sp.get('limit') ?? 50) || 50, 200)
    const offset = Math.max(Number(sp.get('offset') ?? 0) || 0, 0)

    const hiddenRows = await prisma.channelMessageHidden.findMany({
      where: { userId: user.id },
      select: { messageId: true },
    })
    const hiddenIds = hiddenRows.map((r) => r.messageId)

    const where = {
      channelId,
      parentMessageId: null,
      deletedForEveryoneAt: null,
      ...(hiddenIds.length ? { id: { notIn: hiddenIds } } : {}),
    }

    const messages = await prisma.channelMessage.findMany({
      where,
      include: { ...messageInclude, _count: { select: { replies: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    })

    const total = await prisma.channelMessage.count({ where })

    const ascending = [...messages].reverse()
    return NextResponse.json({
      data: ascending.map((m) => serializeMessage(m as unknown as RawMessage, m._count.replies)),
      total,
    })
  } catch (e) {
    return errorResponse(e)
  }
}

// ── POST /channels/[id]/messages — ChannelMessageController::store ────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser()
    const { id } = await params
    const channelId = Number(id)
    const body = await req.json().catch(() => ({}))

    const content = typeof body?.content === 'string' ? body.content : ''
    if (!content) throw validationError('The content field is required.')
    if (content.length > 10000) throw validationError('The content may not be greater than 10000 characters.')

    const parentMessageId =
      body?.parentMessageId == null ? null : Number(body.parentMessageId)
    if (parentMessageId != null && !Number.isInteger(parentMessageId)) {
      throw validationError('The parentMessageId must be an integer.')
    }
    const attachments =
      body?.attachments == null ? null : body.attachments
    if (attachments != null && !Array.isArray(attachments)) {
      throw validationError('The attachments must be an array.')
    }

    await requireChannelAccess(channelId, user, true)

    const created = await prisma.$transaction(async (tx) => {
      const msg = await tx.channelMessage.create({
        data: {
          channelId,
          userId: user.id,
          content,
          attachments: attachments ?? undefined,
          parentMessageId: parentMessageId ?? null,
          replyCount: 0,
          isPinned: false,
          isEdited: false,
          searchableText: content.toLowerCase(),
        },
      })
      if (parentMessageId) {
        await tx.channelMessage.update({
          where: { id: parentMessageId },
          data: { replyCount: { increment: 1 } },
        })
      }
      return msg
    })

    // Extract mentions & create notifications (non-blocking)
    try {
      await processMentions(channelId, user.id, content, created.id)
    } catch (err) {
      console.error('[channels] processMentions failed:', err)
    }

    const message = await prisma.channelMessage.findUniqueOrThrow({
      where: { id: created.id },
      include: messageInclude,
    })
    const memberIds = await getChannelMemberIds(channelId)

    if (parentMessageId) {
      const parent = await prisma.channelMessage.findUnique({
        where: { id: parentMessageId },
        select: { replyCount: true },
      })
      const newReplyCount = parent?.replyCount ?? 0
      await broadcastToUsers('channel:thread:reply', {
        channelId,
        parentId: parentMessageId,
        reply: serializeMessage(message as unknown as RawMessage),
        newReplyCount,
      }, memberIds)
    } else {
      await broadcastToUsers('channel:message:created', {
        channelId,
        message: serializeMessage(message as unknown as RawMessage),
      }, memberIds)

      try {
        await notifyDmRecipients(channelId, user.id, message, memberIds)
      } catch (err) {
        console.error('[channels] notifyDmRecipients failed:', err)
      }
    }

    return NextResponse.json(
      { data: serializeMessage(message as unknown as RawMessage) },
      { status: 201 },
    )
  } catch (e) {
    return errorResponse(e)
  }
}

// ── processMentions — ChannelMessageController::processMentions ───────────────
async function processMentions(
  channelId: number,
  senderId: number,
  content: string,
  messageId: number,
): Promise<void> {
  const members = await prisma.channelMember.findMany({
    where: { channelId },
    include: { user: { select: { id: true, name: true } } },
  })

  let mentionedIds: number[] = []
  if (/@(channel|here|everyone|all)\b/i.test(content)) {
    mentionedIds = members.map((m) => m.userId)
  } else {
    const sorted = [...members].sort(
      (a, b) => (b.user?.name?.length ?? 0) - (a.user?.name?.length ?? 0),
    )
    for (const member of sorted) {
      const name = member.user?.name ?? ''
      if (!name) continue
      const re = new RegExp('@' + escapeRegex(name) + '(?=$|\\s|[^A-Za-z0-9])', 'u')
      if (re.test(content)) mentionedIds.push(member.userId)
    }
  }

  const mentioned = [...new Set(mentionedIds.filter((id) => id !== senderId))]
  if (mentioned.length === 0) return

  await prisma.channelMessage.update({
    where: { id: messageId },
    data: { mentionedUserIds: mentioned },
  })

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { name: true },
  })
  const sender = await prisma.user.findUnique({
    where: { id: senderId },
    select: { name: true },
  })
  const senderName = sender?.name ?? ''
  const channelName = channel?.name ?? ''
  const preview = content.length > 100 ? content.slice(0, 100) + '…' : content
  const message = `${senderName} mentioned you in #${channelName}: "${preview}"`
  const source = `${senderName}·channel:${channelId}`

  for (const uid of mentioned) {
    const notif = await prisma.notification.create({
      data: {
        userId: uid,
        type: 'MENTION',
        message,
        source,
        state: 'UNREAD',
        createdAt: new Date(),
      },
    })
    await broadcastToUsers('notification:created', { notification: notif }, [uid])
  }
}

// ── notifyDmRecipients — ChannelMessageController::notifyDmRecipients ─────────
async function notifyDmRecipients(
  channelId: number,
  senderId: number,
  message: { id: number; content: string | null },
  memberIds: number[],
): Promise<void> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { type: true, name: true },
  })
  if (!channel || channel.type !== 'PRIVATE') return
  if (!isDmName(channel.name)) return

  let recipientIds = memberIds.filter((id) => id !== senderId)
  if (recipientIds.length === 0) return

  const mentionedRaw = await prisma.channelMessage.findUnique({
    where: { id: message.id },
    select: { mentionedUserIds: true },
  })
  const mentioned = (mentionedRaw?.mentionedUserIds as number[] | null) ?? null
  if (mentioned && mentioned.length > 0) {
    const mentionedSet = new Set(mentioned.map((m) => Number(m)))
    recipientIds = recipientIds.filter((id) => !mentionedSet.has(id))
    if (recipientIds.length === 0) return
  }

  const sender = await prisma.user.findUnique({
    where: { id: senderId },
    select: { name: true },
  })
  if (!sender) return

  const content = message.content ?? ''
  const preview = content.length > 100 ? content.slice(0, 100) + '…' : content
  const msg = `${sender.name} sent a message: "${preview}"`
  const source = `${sender.name}·channel:${channelId}`

  for (const uid of recipientIds) {
    const notif = await prisma.notification.create({
      data: {
        userId: uid,
        type: 'DM_RECEIVED',
        message: msg,
        source,
        state: 'UNREAD',
        createdAt: new Date(),
      },
    })
    await broadcastToUsers('notification:created', { notification: notif }, [uid])
  }
}
