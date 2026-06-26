import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { resolveUserScope, getProgramIdsViaMembership, allowsAllUsers } from '@/lib/scope'

export const dynamic = 'force-dynamic'

const MS_DAY = 86_400_000

/** Mirror of ProgramService::executionPulse — blockers, at-risk workstreams, stagnant tasks. */
export async function GET() {
  const user = await requireUser()
  const scope = await resolveUserScope({
    id: user.id, roleType: user.roleType, unitId: user.unitId, directorateId: user.directorateId,
  })

  let accessibleProgramIds: number[] | null = null
  if (!allowsAllUsers(scope)) {
    const membershipIds = await getProgramIdsViaMembership(user.id)
    const scopePrograms = await prisma.program.findMany({
      where: { ownerId: { in: scope.userIds ?? [] } }, select: { id: true },
    })
    accessibleProgramIds = [...new Set([...scopePrograms.map((p) => p.id), ...membershipIds])]
  }

  const now = new Date()
  const in30 = new Date(now.getTime() + 30 * MS_DAY)
  const sevenDaysAgo = new Date(now.getTime() - 7 * MS_DAY)
  const SEV_ORDER: Record<string, number> = { CRITICAL: 1, HIGH: 2, MEDIUM: 3, LOW: 4 }

  const programFilter = accessibleProgramIds !== null ? { id: { in: accessibleProgramIds } } : {}

  const [blockerRows, atRiskWs, stagnantTasks] = await Promise.all([
    prisma.blocker.findMany({
      where: {
        status: 'OPEN',
        workItem: { initiative: { program: { archivedAt: null, ...programFilter } } },
      },
      select: {
        id: true, code: true, title: true, severity: true, status: true, createdAt: true,
        workItem: {
          select: {
            id: true, code: true, title: true,
            initiative: { select: { id: true, name: true, program: { select: { id: true, code: true, name: true } } } },
          },
        },
      },
    }),
    prisma.initiative.findMany({
      where: {
        program: { archivedAt: null, ...programFilter },
        targetCompletion: { lte: in30 },
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
        OR: [{ progressPercent: { lt: 70 } }, { healthStatus: { in: ['RED', 'YELLOW'] } }],
      },
      orderBy: { targetCompletion: 'asc' },
      select: {
        id: true, code: true, name: true, status: true, progressPercent: true, healthStatus: true,
        targetCompletion: true, ownerId: true,
        program: { select: { id: true, code: true, name: true } },
      },
    }),
    prisma.workItem.findMany({
      where: {
        initiative: { program: { archivedAt: null, ...programFilter } },
        status: { in: ['IN_PROGRESS', 'IN_REVIEW'] },
        updatedAt: { lt: sevenDaysAgo },
      },
      orderBy: { updatedAt: 'asc' },
      select: {
        id: true, code: true, title: true, status: true, percentComplete: true, updatedAt: true, assignedTo: true,
        initiative: { select: { id: true, name: true, program: { select: { id: true, code: true, name: true } } } },
      },
    }),
  ])

  const blockers = blockerRows.sort((a, b) => (SEV_ORDER[a.severity] ?? 5) - (SEV_ORDER[b.severity] ?? 5))

  const userIds = [...new Set([
    ...atRiskWs.map((w) => w.ownerId).filter((x): x is number => x != null),
    ...stagnantTasks.map((t) => t.assignedTo).filter((x): x is number => x != null),
  ])]
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : []
  const nameById = new Map(users.map((u) => [u.id, u.name]))
  const diffDays = (a: Date, b: Date) => Math.trunc((b.getTime() - a.getTime()) / MS_DAY)

  const data = {
    activeBlockers: blockers.map((b) => {
      const wi = b.workItem
      const ws = wi?.initiative
      return {
        id: b.id, code: b.code, title: b.title, severity: b.severity, status: b.status,
        createdAt: b.createdAt.toISOString(),
        daysOpen: diffDays(b.createdAt, now),
        assignedTo: null,
        task: wi ? {
          id: wi.id, code: wi.code, title: wi.title,
          workstream: ws ? { id: ws.id, name: ws.name, program: ws.program } : null,
        } : null,
      }
    }),
    atRiskWorkstreams: atRiskWs.map((ws) => ({
      id: ws.id, code: ws.code, name: ws.name, status: ws.status,
      progressPercent: ws.progressPercent, healthStatus: ws.healthStatus ?? 'YELLOW',
      targetCompletion: ws.targetCompletion.toISOString(),
      daysRemaining: diffDays(now, ws.targetCompletion),
      program: ws.program,
      owner: ws.ownerId ? { id: ws.ownerId, name: nameById.get(ws.ownerId) ?? '—' } : null,
    })),
    stagnantItems: stagnantTasks.map((t) => ({
      id: t.id, code: t.code, title: t.title, status: t.status,
      percentComplete: t.percentComplete, updatedAt: t.updatedAt.toISOString(),
      stagnantDays: diffDays(t.updatedAt, now),
      workstream: t.initiative ? { id: t.initiative.id, name: t.initiative.name, program: t.initiative.program } : null,
      assignee: t.assignedTo ? { id: t.assignedTo, name: nameById.get(t.assignedTo) ?? '—' } : null,
    })),
  }

  return NextResponse.json({ data })
}
