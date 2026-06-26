import { NextRequest, NextResponse } from 'next/server'
import { withUser, abortValidation } from '@/lib/http-route'
import { transitionAssignment, STATUS, type SerializedAssignment } from '@/lib/assignments'
import { broadcastAssignment, notifyUser } from '@/lib/broadcast'

export const dynamic = 'force-dynamic'

const ACTIONS = [
  'ACKNOWLEDGE', 'CLARIFY', 'SUBMIT', 'SUBMIT_REVIEW', 'APPROVE',
  'COMPLETE', 'RETURN', 'REJECT', 'CANCEL', 'REOPEN',
]

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  return withUser(async (user) => {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    if (!ACTIONS.includes(body.action)) abortValidation({ action: ['Invalid action.'] })
    const note = typeof body.note === 'string' ? body.note : null

    const a = await transitionAssignment(user, Number(id), body.action, note)
    await broadcastAssignment(a.id, 'status-changed', { status: a.status, action: body.action })
    await notifyAfterTransition(a, body.action, user.id)

    return NextResponse.json({ data: a })
  })
}

/** Mirror AssignmentController::notifyAfterTransition. */
async function notifyAfterTransition(a: SerializedAssignment, action: string, actorId: number) {
  let recipientId: number | null = null
  let type: string | null = null
  let message: string | null = null

  if (a.status === STATUS.IN_REVIEW && a.currentReviewerIdx !== null) {
    recipientId = a.approvalChain.find((e) => e.order === a.currentReviewerIdx)?.userId ?? null
    type = 'ASSIGNMENT_REVIEW'
    message = `Assignment awaiting your review: ${a.title}`
  } else if (a.status === STATUS.DIKERJAKAN && action === 'RETURN') {
    recipientId = a.assigneeId
    type = 'ASSIGNMENT_RETURNED'
    message = `Assignment returned for revision: ${a.title}`
  } else if (a.status === STATUS.REJECTED) {
    recipientId = a.assigneeId
    type = 'ASSIGNMENT_REJECTED'
    message = `Assignment rejected: ${a.title}`
  } else if (a.status === STATUS.SELESAI) {
    recipientId = a.assigneeId
    type = 'ASSIGNMENT_APPROVED'
    message = `Assignment approved & completed: ${a.title}`
  }

  if (!recipientId || recipientId === actorId || !type || !message) return
  await notifyUser(recipientId, type, message, `assignment:${a.id}`)
}
