import 'server-only'
import { prisma } from '@/lib/db'

/* Port WorkspaceController::inboxToday — komitmen jatuh tempo hari ini / lewat:
 * WorkItem (task) + MeetingActionItem + Assignment milik user. */

export type CommitmentItem = {
  kind: 'task' | 'action_item' | 'assignment'
  id: number
  title: string
  status: string
  due: string | null
  meetingId?: number
}

export type CommitmentPayload = {
  items: CommitmentItem[]
  count: number
  breakdown: { task: number; action_item: number; assignment: number }
}

const iso = (d: Date | null) => (d ? d.toISOString() : null)

export async function inboxToday(userId: number): Promise<CommitmentPayload> {
  // endOfDay (today) — sertakan yang jatuh tempo hari ini & yang sudah lewat.
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)

  const [tasks, actionItems, assignments] = await Promise.all([
    prisma.workItem.findMany({
      where: {
        assignedTo: userId,
        targetCompletion: { lte: endOfToday },
        status: { notIn: ['COMPLETED', 'CANCELLED', 'DONE'] },
      },
      orderBy: { targetCompletion: 'asc' },
      take: 50,
      select: { id: true, title: true, status: true, targetCompletion: true },
    }),
    prisma.meetingActionItem.findMany({
      where: {
        assignedToId: userId,
        dueDate: { not: null, lte: endOfToday },
        status: { not: 'COMPLETED' },
      },
      orderBy: { dueDate: 'asc' },
      take: 50,
      select: { id: true, title: true, status: true, dueDate: true, meetingId: true },
    }),
    prisma.assignment.findMany({
      where: {
        assigneeId: userId,
        dueDate: { not: null, lte: endOfToday },
        status: { notIn: ['SELESAI', 'DITOLAK', 'DIBATALKAN', 'COMPLETED', 'CANCELLED'] },
      },
      orderBy: { dueDate: 'asc' },
      take: 50,
      select: { id: true, title: true, status: true, dueDate: true },
    }),
  ])

  const taskItems: CommitmentItem[] = tasks.map((t) => ({
    kind: 'task', id: t.id, title: t.title, status: t.status, due: iso(t.targetCompletion),
  }))
  const actionItemRows: CommitmentItem[] = actionItems.map((a) => ({
    kind: 'action_item', id: a.id, title: a.title, status: a.status, due: iso(a.dueDate), meetingId: a.meetingId,
  }))
  const assignmentRows: CommitmentItem[] = assignments.map((x) => ({
    kind: 'assignment', id: x.id, title: x.title, status: x.status, due: iso(x.dueDate),
  }))

  const items = [...taskItems, ...actionItemRows, ...assignmentRows].sort(
    (a, b) => (a.due ?? '').localeCompare(b.due ?? ''),
  )

  return {
    items,
    count: items.length,
    breakdown: { task: taskItems.length, action_item: actionItemRows.length, assignment: assignmentRows.length },
  }
}
