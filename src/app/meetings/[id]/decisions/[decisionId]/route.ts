import { NextRequest, NextResponse } from 'next/server'
import { withUser } from '@/lib/http-route'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; decisionId: string }> }

/** DELETE /meetings/{id}/decisions/{decisionId} — port of MeetingController::destroyDecision. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return withUser(async () => {
    const { id, decisionId } = await params

    await prisma.meetingDecision.deleteMany({
      where: { meetingId: Number(id), id: Number(decisionId) },
    })

    return NextResponse.json({ ok: true })
  })
}
