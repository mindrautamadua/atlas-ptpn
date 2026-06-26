import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { activityRange, dailyActivity, dateString, sessionDurationMs } from '@/lib/activity'
import { canManageUsers } from '@/lib/role-policy'

export const dynamic = 'force-dynamic'

/** Mirror of WorkspaceController::userActivityDetail — own data or user-manager. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const requester = await requireUser()
  const id = Number((await params).id)
  if (!Number.isFinite(id)) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 })
  }
  if (requester.id !== id && !canManageUsers(requester.roleType)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
  }

  const range = new URL(req.url).searchParams.get('range')
  const { from, to } = activityRange(range)

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, positionTitle: true,
      unit: { select: { id: true, name: true } },
      directorate: { select: { id: true, name: true } },
    },
  })
  if (!user) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 })
  }

  const sessions = await prisma.userSession.findMany({
    where: { userId: id, startedAt: { gte: from, lte: to } },
    orderBy: { startedAt: 'desc' },
  })

  const totalDurationMs = sessions.reduce((sum, s) => sum + sessionDurationMs(s), 0)
  const lastActiveMs = sessions
    .map((s) => (s.endedAt ?? s.lastPingAt ?? s.startedAt).getTime())
    .sort((a, b) => b - a)[0]

  return NextResponse.json({
    data: {
      user: {
        userId: user.id,
        name: user.name,
        positionTitle: user.positionTitle,
        unit: user.unit,
        directorate: user.directorate,
      },
      totalDurationMs,
      sessionCount: sessions.length,
      avgSessionDurationMs: sessions.length > 0 ? Math.round(totalDurationMs / sessions.length) : 0,
      lastActiveAt: lastActiveMs ? new Date(lastActiveMs).toISOString() : null,
      sessions: sessions.map((s) => ({
        id: s.id,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt ? s.endedAt.toISOString() : null,
        durationMs: sessionDurationMs(s),
        endReason: s.endReason,
      })),
      dailyBreakdown: dailyActivity(from, to, sessions),
      from: dateString(from),
      to: dateString(to),
    },
  })
}
