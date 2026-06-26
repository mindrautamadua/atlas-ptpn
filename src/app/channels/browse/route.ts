import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiUser, errorResponse } from '@/lib/channels'

export const dynamic = 'force-dynamic'

// ── GET /channels/browse — ChannelController::browse ──────────────────────────
export async function GET() {
  try {
    const user = await requireApiUser()

    const channels = await prisma.channel.findMany({
      where: { isArchived: false, type: 'PUBLIC' },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { channelMembers: true, channelMessages: true } },
      },
    })

    const channelIds = channels.map((c) => c.id)
    const memberRows = channelIds.length
      ? await prisma.channelMember.findMany({
          where: { userId: user.id, channelId: { in: channelIds } },
          select: { channelId: true },
        })
      : []
    const memberSet = new Set(memberRows.map((r) => r.channelId))

    return NextResponse.json({
      data: channels.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        type: c.type,
        memberCount: c._count.channelMembers,
        messageCount: c._count.channelMessages,
        isMember: memberSet.has(c.id),
      })),
    })
  } catch (e) {
    return errorResponse(e)
  }
}
