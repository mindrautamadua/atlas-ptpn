import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Mirror of BlockerController::index — blockers sorted by severity then age.
 * Returns: { data: Blocker[], total }
 *
 * The FE `Blocker` type reads `task` (mapped from the WorkItem relation) with
 * its workstream/program, so we surface that under `task`.
 */
const SEVERITY_RANK: Record<string, number> = { CRITICAL: 1, HIGH: 2, MEDIUM: 3, LOW: 4 }

export async function GET(req: NextRequest) {
  await requireUser()
  const status = req.nextUrl.searchParams.get('status')

  const rows = await prisma.blocker.findMany({
    where: status ? { status } : undefined,
    select: {
      id: true, code: true, title: true, severity: true, status: true, priority: true,
      assignedTo: true, linkedChannelId: true, createdAt: true, updatedAt: true, workItemId: true,
      workItem: {
        select: {
          id: true, code: true, title: true, initiativeId: true,
          initiative: {
            select: {
              id: true, name: true, programId: true,
              program: { select: { id: true, code: true, name: true, healthStatus: true, approvalStatus: true } },
            },
          },
        },
      },
    },
  })

  const iso = (d: Date | null | undefined) => (d ? d.toISOString() : undefined)

  const data = rows
    .map((b) => ({
      id: b.id,
      code: b.code,
      taskId: b.workItemId,
      title: b.title,
      severity: b.severity,
      status: b.status,
      priority: b.priority,
      assignedTo: b.assignedTo ?? undefined,
      linkedChannelId: b.linkedChannelId ?? undefined,
      createdAt: iso(b.createdAt),
      updatedAt: iso(b.updatedAt),
      task: b.workItem
        ? {
            id: b.workItem.id,
            code: b.workItem.code,
            title: b.workItem.title,
            workstream: b.workItem.initiative
              ? {
                  id: b.workItem.initiative.id,
                  name: b.workItem.initiative.name,
                  program: b.workItem.initiative.program
                    ? {
                        id: b.workItem.initiative.program.id,
                        code: b.workItem.initiative.program.code,
                        name: b.workItem.initiative.program.name,
                        healthStatus: b.workItem.initiative.program.healthStatus ?? undefined,
                        approvalStatus: b.workItem.initiative.program.approvalStatus ?? undefined,
                      }
                    : undefined,
                }
              : undefined,
          }
        : undefined,
      _ts: b.createdAt ? b.createdAt.getTime() : 0,
    }))
    .sort((a, b) => {
      const sr = (SEVERITY_RANK[a.severity] ?? 5) - (SEVERITY_RANK[b.severity] ?? 5)
      if (sr !== 0) return sr
      return a._ts - b._ts
    })
    .map(({ _ts, ...rest }) => { void _ts; return rest })

  return NextResponse.json({ data, total: data.length })
}
