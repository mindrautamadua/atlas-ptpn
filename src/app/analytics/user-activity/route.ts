import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { activityRange, dateString, sessionDurationMs } from '@/lib/activity'
import { canManageUsers } from '@/lib/role-policy'

export const dynamic = 'force-dynamic'

/** Mirror of WorkspaceController::userActivity — activity leaderboard (admin-gated). */
export async function GET(req: Request) {
  const user = await requireUser()
  if (!canManageUsers(user.roleType)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
  }

  const range = new URL(req.url).searchParams.get('range')
  const { from, to } = activityRange(range)

  const sessions = await prisma.userSession.findMany({
    where: { startedAt: { gte: from, lte: to } },
  })
  const statuses = await prisma.userStatus.findMany({ select: { userId: true, status: true } })
  const statusMap = new Map(statuses.map((s) => [s.userId, s.status]))

  const byUser = new Map<number, typeof sessions>()
  for (const s of sessions) {
    const arr = byUser.get(s.userId) ?? []
    arr.push(s)
    byUser.set(s.userId, arr)
  }

  const users = await prisma.user.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, positionTitle: true, avatarUrl: true,
      unit: { select: { id: true, name: true } },
      directorate: { select: { id: true, name: true } },
    },
  })

  const rows = users
    .map((u) => {
      const us = byUser.get(u.id) ?? []
      const totalDurationMs = us.reduce((sum, s) => sum + sessionDurationMs(s), 0)
      const lastActiveMs = us
        .map((s) => (s.endedAt ?? s.lastPingAt ?? s.startedAt).getTime())
        .sort((a, b) => b - a)[0]
      return {
        rank: 0,
        userId: u.id,
        name: u.name,
        positionTitle: u.positionTitle,
        avatarUrl: u.avatarUrl,
        unit: u.unit,
        directorate: u.directorate,
        totalDurationMs,
        sessionCount: us.length,
        lastActiveAt: lastActiveMs ? new Date(lastActiveMs).toISOString() : null,
        isOnline: (statusMap.get(u.id) ?? null) === 'ONLINE',
      }
    })
    .sort((a, b) => b.totalDurationMs - a.totalDurationMs)
    .map((r, i) => ({ ...r, rank: i + 1 }))

  return NextResponse.json({
    data: { users: rows, from: dateString(from), to: dateString(to) },
  })
}
