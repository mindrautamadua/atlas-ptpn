import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Mirror of TaskController::show (JSON branch) — returns { data: TaskDetail }
 * for the TaskDetailModal / TaskDetailView.
 *
 * STUBBED: `comments` is returned empty (the comment endpoints — POST
 * /tasks/{id}/comments, DELETE /comments/{id}, reactions — are not ported).
 * blockers + subTasks are real.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id: idParam } = await params
  const id = Number(idParam)
  if (!Number.isFinite(id)) {
    return NextResponse.json({ message: 'Invalid id' }, { status: 400 })
  }

  const t = await prisma.workItem.findUnique({
    where: { id },
    select: {
      id: true, code: true, title: true, description: true, output: true,
      status: true, priority: true, percentComplete: true, healthStatus: true,
      isBlocked: true, blockedReason: true, targetCompletion: true, estimatedHours: true,
      startDate: true, phaseId: true, assignedTo: true,
      plannedWeeks: true, actualWeeks: true, picUnitIds: true,
      initiative: {
        select: {
          id: true, name: true,
          program: { select: { id: true, code: true, name: true, approvalStatus: true, ownerId: true } },
        },
      },
      blockers: {
        select: { id: true, code: true, title: true, description: true, status: true, severity: true, assignedTo: true },
      },
      subTasks: {
        select: { id: true, title: true, status: true, isCompleted: true, dueDate: true },
      },
    },
  })

  if (!t) return NextResponse.json({ message: 'Not found' }, { status: 404 })

  const assignee = t.assignedTo
    ? await prisma.user.findUnique({ where: { id: t.assignedTo }, select: { id: true, name: true, positionTitle: true } })
    : null

  const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)
  const toStrArr = (v: unknown): string[] | null => (Array.isArray(v) ? (v as string[]) : null)
  const toNumArr = (v: unknown): number[] | null => (Array.isArray(v) ? (v as number[]) : null)

  const data = {
    id: t.id,
    code: t.code,
    title: t.title,
    description: t.description ?? undefined,
    output: t.output ?? null,
    status: t.status,
    priority: t.priority,
    percentComplete: t.percentComplete ?? 0,
    healthStatus: t.healthStatus ?? 'GREEN',
    isBlocked: t.isBlocked ?? false,
    blockedReason: t.blockedReason ?? undefined,
    targetCompletion: iso(t.targetCompletion),
    estimatedHours: t.estimatedHours ?? null,
    assignee: assignee
      ? { id: assignee.id, name: assignee.name, positionTitle: assignee.positionTitle ?? undefined }
      : null,
    comments: [], // STUBBED — comment endpoints not ported
    blockers: t.blockers.map((b) => ({
      id: b.id, code: b.code, title: b.title, description: b.description ?? undefined,
      status: b.status, severity: b.severity, assignedTo: b.assignedTo ?? null,
    })),
    subTasks: t.subTasks.map((s) => ({
      id: s.id, title: s.title, status: s.status, isCompleted: s.isCompleted,
      dueDate: iso(s.dueDate) ?? undefined,
    })),
    workstream: t.initiative
      ? {
          id: t.initiative.id,
          name: t.initiative.name,
          program: t.initiative.program
            ? {
                id: t.initiative.program.id,
                code: t.initiative.program.code,
                name: t.initiative.program.name,
                approvalStatus: t.initiative.program.approvalStatus ?? undefined,
                ownerId: t.initiative.program.ownerId ?? null,
              }
            : undefined,
        }
      : undefined,
    plannedWeeks: toStrArr(t.plannedWeeks),
    actualWeeks: toStrArr(t.actualWeeks),
    picUnitIds: toNumArr(t.picUnitIds),
    picPersonIds: null, // not a WorkItem column in this schema

    startDate: iso(t.startDate),
    phaseId: t.phaseId ?? null,
  }

  return NextResponse.json({ data })
}
