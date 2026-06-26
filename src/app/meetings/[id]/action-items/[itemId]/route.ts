import { NextRequest, NextResponse } from 'next/server'
import { withUser, abort, abortValidation } from '@/lib/http-route'
import { prisma } from '@/lib/db'
import { canSeeAll, notifyMeetingUsers } from '@/lib/meetings'
import { broadcastAll, notifyUser } from '@/lib/broadcast'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; itemId: string }> }

/** Format a date as "d M Y" (Asia/Jakarta) — mirrors PHP Carbon::format('d M Y'). */
function formatDueDate(d: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta',
  }).format(d)
}

/** PATCH /meetings/{id}/action-items/{itemId} — port of MeetingController::updateActionItem. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return withUser(async (user) => {
    const { id, itemId } = await params
    const meetingId = Number(id)

    const item = await prisma.meetingActionItem.findFirst({
      where: { id: Number(itemId), meetingId },
    })
    if (!item) abort(404, 'Action item not found.')

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } })

    const isOrganizer = meeting?.organizerId === user.id
    const isAssigned = item.assignedToId === user.id
    if (!isOrganizer && !isAssigned) abort(403, 'You do not have access.')

    const body = await req.json().catch(() => ({}))

    const data: {
      title?: string
      status?: string
      assignedToId?: number | null
      dueDate?: Date | null
      completedAt?: Date
    } = {}

    if (body.title !== undefined) {
      const title = typeof body.title === 'string' ? body.title : ''
      if (title.length < 3 || title.length > 200) {
        abortValidation({ title: ['The title must be between 3 and 200 characters.'] })
      }
      data.title = title
    }
    if (body.status !== undefined) {
      if (!['OPEN', 'IN_PROGRESS', 'COMPLETED'].includes(body.status)) {
        abortValidation({ status: ['The selected status is invalid.'] })
      }
      data.status = body.status
    }
    // assignedToId is nullable — present key means it is being set (possibly null).
    const hasAssignedKey = Object.prototype.hasOwnProperty.call(body, 'assignedToId')
    if (hasAssignedKey) {
      const raw = body.assignedToId
      const assignedToId = raw == null || raw === '' ? null : Number(raw)
      if (assignedToId != null && !Number.isInteger(assignedToId)) {
        abortValidation({ assignedToId: ['The assignedToId must be an integer.'] })
      }
      data.assignedToId = assignedToId
    }
    if (Object.prototype.hasOwnProperty.call(body, 'dueDate')) {
      if (body.dueDate == null || body.dueDate === '') {
        data.dueDate = null
      } else {
        const d = new Date(body.dueDate)
        if (Number.isNaN(d.getTime())) abortValidation({ dueDate: ['The dueDate is not a valid date.'] })
        data.dueDate = d
      }
    }

    if (data.status === 'COMPLETED') {
      data.completedAt = new Date()
    }

    const prevAssignee = item.assignedToId
    const prevStatus = item.status

    const updated = await prisma.meetingActionItem.update({
      where: { id: item.id },
      data,
    })

    // Notify on reassignment to a new, non-self assignee.
    if (
      hasAssignedKey &&
      data.assignedToId &&
      Number(data.assignedToId) !== Number(prevAssignee) &&
      Number(data.assignedToId) !== Number(user.id)
    ) {
      const due = data.dueDate ? ` (deadline ${formatDueDate(data.dueDate)})` : ''
      const title = meeting?.title ?? 'meeting'
      await notifyMeetingUsers(
        [Number(data.assignedToId)],
        'ACTION_ITEM_ASSIGNED',
        `An action item in the meeting "${title}" was assigned to you: ${updated.title}${due}.`,
        meeting?.id ?? 0,
      )
    }

    // Act→Do close-loop: COMPLETED action item linked to a WorkItem auto-marks
    // the task COMPLETED. One-way only; skip tasks already COMPLETED/CANCELLED.
    if (
      data.status === 'COMPLETED' &&
      prevStatus !== 'COMPLETED' &&
      item.linkedWorkItemId != null
    ) {
      try {
        const task = await prisma.workItem.findUnique({ where: { id: item.linkedWorkItemId } })
        if (task && !['COMPLETED', 'CANCELLED'].includes(task.status)) {
          await prisma.workItem.update({
            where: { id: task.id },
            data: {
              status: 'COMPLETED',
              percentComplete: 100, // field present in schema
              actualCompletion: new Date(), // field present in schema (DateTime?)
            },
          })

          await broadcastAll('task:changed', {
            id: task.id,
            action: 'completed-via-action-item',
            meetingActionItemId: item.id,
          })

          const assigneeId = Number(task.assignedTo ?? 0)
          const creatorId = Number(task.createdBy ?? 0)
          const notifyIds = [
            ...new Set(
              [assigneeId, creatorId].filter((uid) => uid > 0 && uid !== Number(user.id)),
            ),
          ]
          for (const uid of notifyIds) {
            await notifyUser(
              uid,
              'TASK_COMPLETED_VIA_ACTION_ITEM',
              `Task ${task.code} "${task.title}" was automatically completed via a meeting action item.`,
              `meeting-action-item:${item.id}`,
            )
          }
        }
      } catch {
        /* best-effort, mirrors PHP rescue() */
      }
    }

    const fresh = await prisma.meetingActionItem.findUnique({ where: { id: item.id } })
    return NextResponse.json({ data: fresh })
  })
}

/** DELETE /meetings/{id}/action-items/{itemId} — port of MeetingController::destroyActionItem. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return withUser(async (user) => {
    const { id, itemId } = await params
    const meetingId = Number(id)

    const item = await prisma.meetingActionItem.findFirst({
      where: { id: Number(itemId), meetingId },
    })
    if (!item) abort(404, 'Action item not found.')

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } })

    // PHP gate: organizer OR RolePolicy::isAdminOrAbove. canSeeAll
    // (BOD/ADMIN/SUPERADMIN) is used here as an acceptable proxy for
    // admin-or-above since RolePolicy is not yet ported.
    if (meeting?.organizerId !== user.id && !canSeeAll(user.roleType)) {
      abort(403, 'Only the organizer can delete action items.')
    }

    await prisma.meetingActionItem.delete({ where: { id: item.id } })

    return NextResponse.json({ ok: true })
  })
}
