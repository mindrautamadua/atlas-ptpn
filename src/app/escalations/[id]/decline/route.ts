import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withUser, abort, abortValidation } from '@/lib/http-route'
import { notifyUser } from '@/lib/broadcast'
import { fetchEscalation, isTerminalStatus } from '@/lib/escalations'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** Port EscalationController::decline — any non-terminal → DECLINED. */
export async function POST(req: NextRequest, { params }: Ctx) {
  return withUser(async (user) => {
    const { id } = await params
    const esc = await prisma.escalationRequest.findUnique({ where: { id: Number(id) } })
    if (!esc) abort(404, 'Escalation not found.')
    if (esc.escalatedToId !== user.id) abort(403, 'Only the escalation target can decline.')
    if (isTerminalStatus(esc.status)) abort(422, 'Status is already final.')

    const body = await req.json().catch(() => ({}))
    const reason = body.declinedReason
    if (reason == null || typeof reason !== 'string' || reason.length < 5) {
      abortValidation({ declinedReason: ['The declinedReason must be at least 5 characters.'] })
    } else if (reason.length > 1000) {
      abortValidation({ declinedReason: ['The declinedReason may not be greater than 1000 characters.'] })
    }

    await prisma.escalationRequest.update({
      where: { id: esc.id },
      data: { status: 'DECLINED', declinedReason: reason, resolvedAt: new Date() },
    })

    try {
      await notifyUser(esc.requestedById, 'CLEAR_PATH_CLEARED',
        `Your escalation was declined by ${user.name}: ${reason}`, `escalation:${esc.id}`)
    } catch (e) { console.error('[escalations/decline] notify', e) }

    return NextResponse.json({ data: await fetchEscalation(esc.id) })
  })
}
