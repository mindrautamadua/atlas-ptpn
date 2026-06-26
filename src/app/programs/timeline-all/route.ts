import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { resolveUserScope, getProgramIdsViaMembership, allowsAllUsers } from '@/lib/scope'

export const dynamic = 'force-dynamic'

/** Mirror of ProgramService::timelineAll — Gantt data incl. workstreams. */
export async function GET() {
  const user = await requireUser()
  const scope = await resolveUserScope({
    id: user.id, roleType: user.roleType, unitId: user.unitId, directorateId: user.directorateId,
  })

  let where: Record<string, unknown> = {}
  if (!allowsAllUsers(scope)) {
    const membershipIds = await getProgramIdsViaMembership(user.id)
    where = { OR: [{ ownerId: { in: scope.userIds ?? [] } }, { id: { in: membershipIds } }] }
  }

  const programs = await prisma.program.findMany({
    where,
    orderBy: { startDate: 'asc' },
    select: {
      id: true, code: true, name: true, status: true, priority: true, progressPercent: true,
      healthStatus: true, startDate: true, targetEndDate: true, actualEndDate: true,
      initiatives: {
        orderBy: { startDate: 'asc' },
        select: {
          id: true, code: true, name: true, status: true, startDate: true,
          targetCompletion: true, progressPercent: true, healthStatus: true,
        },
      },
    },
  })

  const data = programs.map((p) => ({
    id: p.id, code: p.code, name: p.name, status: p.status, priority: p.priority,
    progressPercent: p.progressPercent, healthStatus: p.healthStatus ?? 'YELLOW', riskScore: 0,
    startDate: p.startDate.toISOString(),
    targetEndDate: p.targetEndDate.toISOString(),
    actualEndDate: p.actualEndDate ? p.actualEndDate.toISOString() : null,
    workstreams: p.initiatives.map((w) => ({
      id: w.id, code: w.code, name: w.name, status: w.status,
      startDate: w.startDate ? w.startDate.toISOString() : null,
      targetCompletion: w.targetCompletion.toISOString(),
      progressPercent: w.progressPercent, healthStatus: w.healthStatus ?? 'YELLOW',
    })),
  }))

  return NextResponse.json({ data })
}
