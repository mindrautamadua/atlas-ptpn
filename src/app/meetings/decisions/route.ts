import { NextRequest, NextResponse } from 'next/server'
import { withUser } from '@/lib/http-route'
import { prisma } from '@/lib/db'
import { canSeeAll } from '@/lib/meetings'

export const dynamic = 'force-dynamic'

/**
 * GET /meetings/decisions — port of MeetingController::decisions.
 * Static segment, coexists with /meetings/[id].
 */
export async function GET(req: NextRequest) {
  return withUser(async (user) => {
    const q = req.nextUrl.searchParams.get('q')

    const where: Record<string, unknown> = {}
    if (q) where.decision = { contains: q, mode: 'insensitive' }

    // Non-portfolio roles only see decisions on meetings they organize/attend.
    // MeetingDecision has a `meeting` relation → filter through it directly.
    if (!canSeeAll(user.roleType)) {
      where.meeting = {
        OR: [{ organizerId: user.id }, { attendees: { some: { userId: user.id } } }],
      }
    }

    const decisions = await prisma.meetingDecision.findMany({
      where,
      include: {
        meeting: { select: { id: true, title: true, startAt: true, meetingType: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    const userIds = [...new Set(decisions.map((d) => d.decidedBy))]
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, roleType: true },
    })
    const userMap = new Map(users.map((u) => [u.id, u]))

    return NextResponse.json({
      data: decisions.map((d) => ({
        ...d,
        decidedByUser: userMap.get(d.decidedBy) ?? null,
      })),
    })
  })
}
