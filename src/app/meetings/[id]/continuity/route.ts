import { NextRequest, NextResponse } from 'next/server'
import { withUser, abort } from '@/lib/http-route'
import { prisma } from '@/lib/db'
import { hasMeetingAccess, buildContinuity } from '@/lib/meetings'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** GET /meetings/{id}/continuity — port of MeetingController::continuity. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  return withUser(async (user) => {
    const { id } = await params

    const meeting = await prisma.meeting.findUnique({
      where: { id: Number(id) },
      select: {
        id: true,
        startAt: true,
        status: true,
        linkedProgramId: true,
        meetingType: true,
        organizerId: true,
        attendees: { select: { userId: true } },
      },
    })
    if (!meeting) abort(404, 'Meeting not found.')
    if (!hasMeetingAccess(meeting, user.id, user.roleType)) {
      abort(403, 'You do not have access to this meeting.')
    }

    return NextResponse.json({ data: await buildContinuity(meeting) })
  })
}
