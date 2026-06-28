import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withUser, abort, abortValidation } from '@/lib/http-route'
import { notifyUser } from '@/lib/broadcast'
import { fetchEscalation, isTerminalStatus } from '@/lib/escalations'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** Port EscalationController::commit (via disposition) — REQUESTED → COMMITTED. */
export async function POST(req: NextRequest, { params }: Ctx) {
  return withUser(async (user) => {
    const { id } = await params
    const esc = await prisma.escalationRequest.findUnique({ where: { id: Number(id) } })
    if (!esc) abort(404, 'Escalation not found.')
    if (esc.escalatedToId !== user.id) abort(403, 'Only the escalation target can change the disposition.')
    if (isTerminalStatus(esc.status)) abort(422, 'Status is already final.')
    if (esc.status !== 'REQUESTED') abort(422, `The current status (${esc.status}) cannot be changed to COMMITTED.`)

    const body = await req.json().catch(() => ({}))
    const errors: Record<string, string[]> = {}

    let dueDate: Date | null = null
    if (body.commitmentDueDate != null && body.commitmentDueDate !== '') {
      dueDate = new Date(body.commitmentDueDate)
      if (isNaN(dueDate.getTime())) errors.commitmentDueDate = ['The commitmentDueDate is not a valid date.']
      else {
        const today = new Date(); today.setHours(0, 0, 0, 0)
        if (dueDate < today) errors.commitmentDueDate = ['The commitmentDueDate must be a date after or equal to today.']
      }
    }
    const note = body.commitmentNote
    if (note != null && typeof note === 'string' && note.length > 1000) {
      errors.commitmentNote = ['The commitmentNote may not be greater than 1000 characters.']
    }
    if (Object.keys(errors).length) abortValidation(errors)

    await prisma.escalationRequest.update({
      where: { id: esc.id },
      data: {
        status: 'COMMITTED',
        committedAt: new Date(),
        commitmentDueDate: dueDate,
        commitmentNote: typeof note === 'string' ? note : null,
      },
    })

    try {
      await notifyUser(esc.requestedById, 'CLEAR_PATH_COMMITTED',
        `${user.name} committed to clearing: ${esc.title}`, `escalation:${esc.id}`)
    } catch (e) { console.error('[escalations/commit] notify', e) }

    return NextResponse.json({ data: await fetchEscalation(esc.id) })
  })
}
