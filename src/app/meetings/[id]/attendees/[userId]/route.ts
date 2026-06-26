import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withUser, abort } from '@/lib/http-route'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; userId: string }> }

/** Port of MeetingController::removeAttendee. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return withUser(async (user) => {
    const { id, userId } = await params
    const meetingId = Number(id)
    const targetUserId = Number(userId)

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } })
    if (!meeting) abort(404, 'Meeting not found.')

    if (meeting.organizerId !== user.id) {
      abort(403, 'Only the organizer can remove attendees.')
    }

    await prisma.meetingAttendee.deleteMany({
      where: { meetingId, userId: targetUserId },
    })

    return NextResponse.json({ ok: true })
  })
}
