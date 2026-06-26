import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withUser, abort, abortValidation } from '@/lib/http-route'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** Port of MeetingController::rsvp. */
export async function POST(req: NextRequest, { params }: Ctx) {
  return withUser(async (user) => {
    const { id } = await params
    const meetingId = Number(id)
    const userId = user.id

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } })
    if (!meeting) abort(404, 'Meeting not found.')

    // isTerminal() == CANCELLED || COMPLETED.
    if (meeting.status === 'CANCELLED' || meeting.status === 'COMPLETED') {
      abortValidation({
        general: [
          `Cannot RSVP to a meeting that has been ${
            meeting.status === 'CANCELLED' ? 'cancelled' : 'completed'
          }.`,
        ],
      })
    }
    if (meeting.status === 'POSTPONED') {
      abortValidation({ general: ['Cannot RSVP to a meeting that is postponed.'] })
    }

    const body = await req.json().catch(() => ({}))
    const errors: Record<string, string[]> = {}

    if (!['HADIR', 'TIDAK_HADIR', 'DELEGASI'].includes(body.rsvpStatus)) {
      errors.rsvpStatus = ['The selected rsvpStatus is invalid.']
    }
    if (body.delegateToId !== undefined && body.delegateToId !== null && !Number.isInteger(body.delegateToId)) {
      errors.delegateToId = ['The delegateToId must be an integer.']
    }
    if (
      body.delegateNote !== undefined &&
      body.delegateNote !== null &&
      (typeof body.delegateNote !== 'string' || body.delegateNote.length > 200)
    ) {
      errors.delegateNote = ['The delegateNote may not be greater than 200 characters.']
    }
    if (Object.keys(errors).length) abortValidation(errors)

    const rsvpStatus: string = body.rsvpStatus
    const delegateToId: number | null = body.delegateToId ?? null
    const delegateNote: string | null = body.delegateNote ?? null

    if (rsvpStatus === 'DELEGASI') {
      if (!delegateToId) abortValidation({ general: ['delegateToId is required for DELEGASI.'] })
      if (delegateToId === userId) abortValidation({ general: ['You cannot delegate to yourself.'] })
      const delegateUser = await prisma.user.findFirst({
        where: { id: delegateToId, isActive: true },
      })
      if (!delegateUser) {
        abortValidation({ general: ['The delegate user was not found or is inactive.'] })
      }
    }

    const attendee = await prisma.meetingAttendee.findFirst({
      where: { meetingId, userId },
    })
    if (!attendee) abortValidation({ general: ['You are not invited to this meeting.'] })
    if (attendee.attendeeRole === 'ORGANIZER') {
      abortValidation({ general: ['The organizer does not need to RSVP.'] })
    }

    await prisma.meetingAttendee.update({
      where: { id: attendee.id },
      data: {
        rsvpStatus,
        delegateToId: rsvpStatus === 'DELEGASI' ? delegateToId : null,
        delegateNote: rsvpStatus === 'DELEGASI' ? delegateNote : null,
        respondedAt: new Date(),
      },
    })

    const fresh = await prisma.meetingAttendee.findUnique({ where: { id: attendee.id } })
    return NextResponse.json({ data: fresh })
  })
}
