import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withUser, abort, abortValidation } from '@/lib/http-route'
import { notifyUser } from '@/lib/broadcast'
import { fetchEscalation } from '@/lib/escalations'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** Port EscalationController::resolve — COMMITTED/IN_PROGRESS → CLEARED. */
export async function POST(req: NextRequest, { params }: Ctx) {
  return withUser(async (user) => {
    const { id } = await params
    const esc = await prisma.escalationRequest.findUnique({ where: { id: Number(id) } })
    if (!esc) abort(404, 'Escalation not found.')
    if (esc.escalatedToId !== user.id) abort(403, 'Only the escalation target can resolve.')
    if (esc.status !== 'COMMITTED' && esc.status !== 'IN_PROGRESS') {
      abort(422, 'Resolve is only available for requests with status COMMITTED/IN_PROGRESS.')
    }

    const body = await req.json().catch(() => ({}))
    const note = body.resolutionNote
    if (note == null || typeof note !== 'string' || note.length < 5) {
      abortValidation({ resolutionNote: ['The resolutionNote must be at least 5 characters.'] })
    } else if (note.length > 1000) {
      abortValidation({ resolutionNote: ['The resolutionNote may not be greater than 1000 characters.'] })
    }

    await prisma.escalationRequest.update({
      where: { id: esc.id },
      data: { status: 'CLEARED', resolutionNote: note, resolvedAt: new Date() },
    })

    try {
      await notifyUser(esc.requestedById, 'CLEAR_PATH_CLEARED',
        `Blocker cleared by ${user.name}: ${esc.title}`, `escalation:${esc.id}`)
    } catch (e) { console.error('[escalations/resolve] notify', e) }

    return NextResponse.json({ data: await fetchEscalation(esc.id) })
  })
}
