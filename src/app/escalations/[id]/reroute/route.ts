import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withUser, abort, abortValidation } from '@/lib/http-route'
import { notifyUser } from '@/lib/broadcast'
import { fetchEscalation, isTerminalStatus, generateEscalationCode } from '@/lib/escalations'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** Port EscalationController::reroute — REROUTED + buat escalation baru ke target lain (chain).
 *  NOTE: kebijakan cross-direktorat (OrgChainService) belum diport — di-skip. */
export async function POST(req: NextRequest, { params }: Ctx) {
  return withUser(async (user) => {
    const { id } = await params
    const esc = await prisma.escalationRequest.findUnique({ where: { id: Number(id) } })
    if (!esc) abort(404, 'Escalation not found.')
    if (esc.escalatedToId !== user.id) abort(403, 'Only the escalation target can reroute.')
    if (isTerminalStatus(esc.status)) abort(422, 'Status is already final.')

    const body = await req.json().catch(() => ({}))
    const reroutedToId = Number(body.reroutedToId)
    if (!body.reroutedToId || !Number.isInteger(reroutedToId)) {
      abortValidation({ reroutedToId: ['The reroutedToId field is required.'] })
    }
    const note = body.commitmentNote
    if (note != null && typeof note === 'string' && note.length > 500) {
      abortValidation({ commitmentNote: ['The commitmentNote may not be greater than 500 characters.'] })
    }
    if (reroutedToId === esc.escalatedToId) abort(422, 'Cannot reroute to the current target.')

    const newTarget = await prisma.user.findUnique({ where: { id: reroutedToId }, select: { id: true, name: true } })
    if (!newTarget) abort(422, 'Reroute target user not found.')

    const newReq = await prisma.$transaction(async (tx) => {
      await tx.escalationRequest.update({
        where: { id: esc.id },
        data: {
          status: 'REROUTED',
          reroutedToId: newTarget.id,
          commitmentNote: typeof note === 'string' ? note : null,
          resolvedAt: new Date(),
        },
      })
      return tx.escalationRequest.create({
        data: {
          code: await generateEscalationCode(tx),
          sourceType: esc.sourceType,
          sourceId: esc.sourceId,
          requestedById: esc.requestedById,
          escalatedToId: newTarget.id,
          title: `[Rerouted from ${user.name}] ${esc.title}`,
          description: esc.description,
          linkedProgramId: esc.linkedProgramId,
          status: 'REQUESTED',
        },
      })
    })

    try {
      await notifyUser(newTarget.id, 'CLEAR_PATH_REQUESTED',
        `An escalation was rerouted to you from ${user.name}: ${newReq.title}`, `escalation:${newReq.id}`)
      await notifyUser(esc.requestedById, 'CLEAR_PATH_REQUESTED',
        `Escalation "${esc.title}" was rerouted to ${newTarget.name}. Click to view the new tracking.`, `escalation:${newReq.id}`)
    } catch (e) { console.error('[escalations/reroute] notify', e) }

    return NextResponse.json({ data: await fetchEscalation(esc.id) })
  })
}
