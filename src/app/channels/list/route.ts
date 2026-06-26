import { NextResponse, type NextRequest } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/db'
import { broadcastAll } from '@/lib/broadcast'
import {
  requireApiUser, errorResponse, isAdminRole, isDmName, validationError,
} from '@/lib/channels'

export const dynamic = 'force-dynamic'

// ── GET /channels — ChannelController::index + listForUser + linkedProgramsFor ──
export async function GET() {
  try {
    const user = await requireApiUser()
    const channels = await listChannelsForUser(user.id, user.roleType)
    const programs = await linkedProgramsFor(channels)
    return NextResponse.json({ data: channels, total: channels.length, programs })
  } catch (e) {
    return errorResponse(e)
  }
}

// ── POST /channels — ChannelController::store ─────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser()
    const body = await req.json().catch(() => ({}))
    const name = String(body?.name ?? '').trim()
    if (!name || name.length > 80) throw validationError('The name field is required (max 80).')
    const type = body?.type === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC'

    const code = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

    const channel = await prisma.channel.create({
      data: {
        name,
        description: body?.description ?? null,
        type,
        topicType: body?.topicType ?? null,
        linkedProgramId: body?.linkedProgramId ?? null,
        linkedInitiativeId: body?.linkedWorkstreamId ?? null,
        code,
        createdBy: user.id,
        ownerUnitId: user.unitId ?? null,
        isArchived: false,
        allowThreads: true,
        allowReactions: true,
      },
    })

    // Auto-add creator as starred member
    await prisma.channelMember.create({
      data: { channelId: channel.id, userId: user.id, isMuted: false, isStarred: true },
    })

    await broadcastAll('channel:channel:created', { channel })

    return NextResponse.json({ data: channel }, { status: 201 })
  } catch (e) {
    return errorResponse(e)
  }
}

// ── listForUser ───────────────────────────────────────────────────────────────
type ChannelListItem = Awaited<ReturnType<typeof listChannelsForUser>>[number]

async function listChannelsForUser(userId: number, roleType: string | null) {
  const isAdmin = isAdminRole(roleType)

  const memberRows = await prisma.channelMember.findMany({
    where: { userId },
    select: { channelId: true },
  })
  const memberChannelIds = memberRows.map((r) => r.channelId)

  const where: Prisma.ChannelWhereInput = { isArchived: false }
  if (!isAdmin) {
    where.OR = [{ type: 'PUBLIC' }, { id: { in: memberChannelIds.length ? memberChannelIds : [-1] } }]
  }

  const channels = await prisma.channel.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { channelMembers: true } },
      channelMembers: { where: { userId }, select: { isStarred: true, isMuted: true } },
    },
  })

  const channelIds = channels.map((c) => c.id)
  if (channelIds.length === 0) return [] as Array<ReturnType<typeof shapeChannel>>

  // Last message per channel (DISTINCT ON)
  const lastMsgRows = await prisma.$queryRaw<
    Array<{ id: number; channelId: number; content: string; createdAt: Date; userId: number }>
  >(Prisma.sql`
    SELECT DISTINCT ON ("channelId") "id", "channelId", "content", "createdAt", "userId"
    FROM "ptpn_kmr_app"."ChannelMessage"
    WHERE "channelId" IN (${Prisma.join(channelIds)})
      AND "deletedForEveryoneAt" IS NULL
      AND "parentMessageId" IS NULL
    ORDER BY "channelId", "createdAt" DESC
  `)
  const lastMsgMap = new Map(lastMsgRows.map((m) => [m.channelId, m]))

  // Unread per channel
  const unreadRows = await prisma.$queryRaw<Array<{ channelId: number; cnt: number }>>(Prisma.sql`
    SELECT m."channelId" AS "channelId", count(*)::int AS cnt
    FROM "ptpn_kmr_app"."ChannelMessage" m
    JOIN "ptpn_kmr_app"."ChannelMember" cm ON cm."channelId" = m."channelId" AND cm."userId" = ${userId}
    WHERE m."channelId" IN (${Prisma.join(channelIds)})
      AND m."userId" <> ${userId}
      AND m."deletedForEveryoneAt" IS NULL
      AND m."parentMessageId" IS NULL
      AND m."createdAt" > coalesce(cm."lastViewedAt", cm."joinedAt")
    GROUP BY m."channelId"
  `)
  const unreadMap = new Map(unreadRows.map((r) => [r.channelId, Number(r.cnt)]))

  function shapeChannel(ch: (typeof channels)[number]) {
    const membership = ch.channelMembers[0] ?? null
    const lastMsg = lastMsgMap.get(ch.id)
    return {
      id: ch.id,
      code: ch.code,
      name: ch.name,
      type: ch.type,
      description: ch.description,
      topicType: ch.topicType,
      linkedProgramId: ch.linkedProgramId,
      linkedWorkstreamId: ch.linkedInitiativeId,
      memberCount: ch._count.channelMembers,
      isStarred: Boolean(membership?.isStarred ?? false),
      isMuted: Boolean(membership?.isMuted ?? false),
      unreadCount: membership ? unreadMap.get(ch.id) ?? 0 : 0,
      isMember: membership !== null,
      isDirectMessage: ch.type === 'PRIVATE' && isDmName(ch.name),
      canManageMembers: isAdmin || ch.createdBy === userId,
      lastMessage: lastMsg
        ? {
            id: lastMsg.id,
            content: lastMsg.content,
            createdAt: lastMsg.createdAt.toISOString(),
            userId: lastMsg.userId,
          }
        : null,
    }
  }

  return channels.map(shapeChannel)
}

async function linkedProgramsFor(channels: ChannelListItem[]) {
  const ids = [...new Set(channels.map((c) => c.linkedProgramId).filter((x): x is number => x != null))]
  if (ids.length === 0) return []
  const programs = await prisma.program.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, code: true, name: true, status: true, priority: true,
      progressPercent: true, healthStatus: true, approvalStatus: true,
      rejectionNote: true, targetEndDate: true,
    },
  })
  return programs.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    status: p.status,
    priority: p.priority,
    progressPercent: p.progressPercent ?? 0,
    healthStatus: p.healthStatus ?? 'YELLOW',
    approvalStatus: p.approvalStatus,
    rejectionNote: p.rejectionNote,
    targetEndDate: p.targetEndDate ? p.targetEndDate.toISOString() : null,
  }))
}
