import { NextRequest, NextResponse } from 'next/server'
import { withUser, abortValidation } from '@/lib/http-route'
import { listForUser, createAssignment } from '@/lib/assignments'
import { broadcastAssignment, notifyUser } from '@/lib/broadcast'

export const dynamic = 'force-dynamic'

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

export async function GET(req: NextRequest) {
  return withUser(async (user) => {
    const sp = req.nextUrl.searchParams
    const items = await listForUser(user, {
      scope: sp.get('scope') ?? undefined,
      status: sp.get('status') ?? undefined,
      priority: sp.get('priority') ?? undefined,
    })
    return NextResponse.json({ data: items, total: items.length })
  })
}

export async function POST(req: NextRequest) {
  return withUser(async (user) => {
    const body = await req.json().catch(() => ({}))
    const errors: Record<string, string[]> = {}

    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (title.length < 2 || title.length > 200) errors.title = ['The title must be between 2 and 200 characters.']

    if (body.priority !== undefined && !PRIORITIES.includes(body.priority)) {
      errors.priority = ['Invalid priority.']
    }

    const assigneeId = Number(body.assigneeId)
    if (!Number.isInteger(assigneeId)) errors.assigneeId = ['The assignee is required.']

    if (!body.dueDate) {
      errors.dueDate = ['The due date is required.']
    } else {
      const due = new Date(body.dueDate)
      if (Number.isNaN(due.getTime())) errors.dueDate = ['The due date is invalid.']
      else {
        const today = new Date(); today.setHours(0, 0, 0, 0)
        if (due <= today) errors.dueDate = ['The due date must be after today.']
      }
    }

    if (Object.keys(errors).length) abortValidation(errors)

    const assignment = await createAssignment(user, {
      title,
      description: typeof body.description === 'string' ? body.description : null,
      priority: body.priority,
      dueDate: body.dueDate,
      assigneeId,
      watcherIds: Array.isArray(body.watcherIds) ? body.watcherIds.map(Number) : null,
      relatedProgramId: body.relatedProgramId != null ? Number(body.relatedProgramId) : null,
      tags: Array.isArray(body.tags) ? body.tags : null,
      evidenceRequired: body.evidenceRequired !== false,
      isPrivate: Boolean(body.isPrivate),
    })

    await broadcastAssignment(assignment.id, 'created')
    await notifyUser(
      assignment.assigneeId,
      'TASK_ASSIGNED',
      `New assignment: ${assignment.title}`,
      `assignment:${assignment.id}`,
    )

    return NextResponse.json({ data: assignment }, { status: 201 })
  })
}
