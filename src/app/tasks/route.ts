import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { orgScopeForUser } from '@/lib/org-scope'

export const dynamic = 'force-dynamic'

/**
 * Mirror of TaskController::index — WorkItems grouped by status into
 * WorkGroup[] = { status, count, items }. Org-scoped: non-executive users see
 * only tasks they own/created or tasks on programs owned by units in scope.
 *
 * Returns: { groups: WorkGroup[], total }
 */
export async function GET(req: NextRequest) {
  const user = await requireUser()
  const scope = await orgScopeForUser({
    id: user.id, roleType: user.roleType, unitId: user.unitId, directorateId: user.directorateId,
  })

  const where: Record<string, unknown> = {}

  // Scope guard (C1): non-executive → own/created tasks OR tasks on programs
  // whose owner unit is in scope.
  if (!scope.isExecutive) {
    const orClauses: Record<string, unknown>[] = [
      { assignedTo: user.id },
      { createdBy: user.id },
    ]
    if (scope.unitIds.length) {
      orClauses.push({ initiative: { program: { ownerUnitId: { in: scope.unitIds } } } })
    }
    where.OR = orClauses
  }

  // Cap board growth: COMPLETED/CANCELLED finished older than window aren't
  // loaded by default. Active statuses always load. NULL actualCompletion not hidden.
  // ?scope=all → full history.
  if (req.nextUrl.searchParams.get('scope') !== 'all') {
    const windowDays = 90
    const cutoff = new Date(Date.now() - windowDays * 86_400_000)
    where.AND = [
      {
        OR: [
          { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
          { actualCompletion: { gte: cutoff } },
          { actualCompletion: null },
        ],
      },
    ]
  }

  const rows = await prisma.workItem.findMany({
    where,
    orderBy: { targetCompletion: 'asc' },
    select: {
      id: true, code: true, initiativeId: true, title: true, assignedTo: true, createdBy: true,
      createdByUnitId: true, status: true, priority: true, percentComplete: true,
      startDate: true, targetCompletion: true, actualCompletion: true,
      healthStatus: true, isBlocked: true, blockedReason: true, createdAt: true, updatedAt: true,
      initiative: {
        select: {
          id: true, code: true, name: true, programId: true,
          program: {
            select: {
              id: true, code: true, name: true, healthStatus: true, approvalStatus: true,
              ownerUnitId: true, startDate: true, targetEndDate: true, actualEndDate: true,
            },
          },
        },
      },
    },
  })

  // WorkItem has no named `assignee` relation (assignedTo is a bare FK), so
  // resolve assignee users in one batched query.
  const assigneeIds = [...new Set(rows.map((r) => r.assignedTo).filter((x): x is number => x != null))]
  const assigneeRows = assigneeIds.length
    ? await prisma.user.findMany({
        where: { id: { in: assigneeIds } },
        select: { id: true, name: true, roleType: true, avatarUrl: true },
      })
    : []
  const assigneeById = new Map(assigneeRows.map((u) => [u.id, u]))

  const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

  const items = rows.map((t) => ({
    id: t.id,
    code: t.code,
    title: t.title,
    status: t.status,
    priority: t.priority,
    percentComplete: t.percentComplete ?? 0,
    healthStatus: t.healthStatus ?? 'GREEN',
    isBlocked: t.isBlocked ?? false,
    blockedReason: t.blockedReason ?? null,
    startDate: iso(t.startDate),
    targetCompletion: iso(t.targetCompletion) ?? undefined,
    actualCompletion: iso(t.actualCompletion),
    createdAt: iso(t.createdAt) ?? undefined,
    updatedAt: iso(t.updatedAt) ?? undefined,
    blockerCount: 0,
    commentsCount: 0,
    createdByUnitId: t.createdByUnitId ?? undefined,
    workstream: t.initiative
      ? {
          id: t.initiative.id,
          name: t.initiative.name,
          program: t.initiative.program
            ? {
                id: t.initiative.program.id,
                code: t.initiative.program.code,
                name: t.initiative.program.name,
                healthStatus: t.initiative.program.healthStatus ?? undefined,
                approvalStatus: t.initiative.program.approvalStatus ?? undefined,
                ownerUnitId: t.initiative.program.ownerUnitId ?? undefined,
                startDate: iso(t.initiative.program.startDate),
                targetEndDate: iso(t.initiative.program.targetEndDate),
                actualEndDate: iso(t.initiative.program.actualEndDate),
              }
            : undefined,
        }
      : undefined,
    assignee: (() => {
      const u = t.assignedTo != null ? assigneeById.get(t.assignedTo) : undefined
      return u ? { id: u.id, name: u.name, roleType: u.roleType ?? undefined, avatarUrl: u.avatarUrl ?? undefined } : undefined
    })(),
  }))

  const byStatus = new Map<string, typeof items>()
  for (const it of items) {
    const arr = byStatus.get(it.status) ?? []
    arr.push(it)
    byStatus.set(it.status, arr)
  }
  const groups = [...byStatus.entries()].map(([status, list]) => ({
    status,
    count: list.length,
    items: list,
  }))

  return NextResponse.json({ groups, total: items.length })
}
