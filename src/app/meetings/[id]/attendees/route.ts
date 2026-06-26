import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withUser, abort, abortValidation } from '@/lib/http-route'
import { notifyMeetingUsers, formatMeetingWhen } from '@/lib/meetings'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** Port of MeetingController::addAttendee. */
export async function POST(req: NextRequest, { params }: Ctx) {
  return withUser(async (user) => {
    const { id } = await params
    const meetingId = Number(id)

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } })
    if (!meeting) abort(404, 'Meeting not found.')

    if (meeting.organizerId !== user.id) {
      abort(403, 'Only the organizer can add attendees.')
    }

    const body = await req.json().catch(() => ({}))
    const errors: Record<string, string[]> = {}

    if (!Number.isInteger(body.userId)) {
      errors.userId = ['The userId field is required and must be an integer.']
    }
    if (
      body.attendeeRole !== undefined &&
      body.attendeeRole !== null &&
      !['REQUIRED', 'OPTIONAL'].includes(body.attendeeRole)
    ) {
      errors.attendeeRole = ['The selected attendeeRole is invalid.']
    }
    if (Object.keys(errors).length) abortValidation(errors)

    const targetUserId: number = body.userId
    const attendeeRole: string = body.attendeeRole ?? 'REQUIRED'

    const existing = await prisma.meetingAttendee.findUnique({
      where: { meetingId_userId: { meetingId, userId: targetUserId } },
    })

    await prisma.meetingAttendee.upsert({
      where: { meetingId_userId: { meetingId, userId: targetUserId } },
      update: { attendeeRole, rsvpStatus: 'PENDING' },
      create: { meetingId, userId: targetUserId, attendeeRole, rsvpStatus: 'PENDING' },
    })

    if (!existing) {
      await notifyMeetingUsers(
        [targetUserId],
        'MEETING_INVITED',
        `You have been invited to the meeting "${meeting.title}" on ${formatMeetingWhen(meeting.startAt)}.`,
        meeting.id,
      )
    }

    return NextResponse.json({ ok: true })
  })
}
