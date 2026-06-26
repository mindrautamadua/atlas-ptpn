import { NextRequest, NextResponse } from 'next/server'
import { withUser, abortValidation } from '@/lib/http-route'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** POST /meetings/{id}/decisions — port of MeetingController::addDecision. */
export async function POST(req: NextRequest, { params }: Ctx) {
  return withUser(async (user) => {
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    const decision = typeof body.decision === 'string' ? body.decision : ''
    if (decision.length < 3 || decision.length > 600) {
      abortValidation({ decision: ['The decision field must be between 3 and 600 characters.'] })
    }

    const created = await prisma.meetingDecision.create({
      data: {
        meetingId: Number(id),
        decision,
        decidedBy: user.id,
      },
    })

    return NextResponse.json({ data: created }, { status: 201 })
  })
}
