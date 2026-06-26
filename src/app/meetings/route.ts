import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withUser, abortValidation } from '@/lib/http-route'
import {
  queryMeetings,
  enrichMeetings,
  notifyMeetingUsers,
  formatMeetingWhen,
  MEETING_INCLUDE,
} from '@/lib/meetings'

export const dynamic = 'force-dynamic'

const MEETING_TYPES = [
  'RAPAT_DIREKSI',
  'RAPAT_KOORDINASI',
  'RAPAT_DIVISI',
  'RAPAT_TIM',
  'ONE_ON_ONE',
]

/** Port of MeetingController::index (JSON branch only). */
export async function GET(req: NextRequest) {
  return withUser(async (user) => {
    const sp = new URL(req.url).searchParams
    const meetings = await queryMeetings(user, {
      filter: sp.get('filter'),
      from: sp.get('from'),
      to: sp.get('to'),
      forUserId: sp.get('forUserId'),
    })
    return NextResponse.json({ data: meetings, total: meetings.length })
  })
}

/** Port of MeetingController::store. */
export async function POST(req: NextRequest) {
  return withUser(async (user) => {
    const body = await req.json().catch(() => ({}))

    // ── Validation (mirror Laravel validate()) ──────────────────────────────
    const errors: Record<string, string[]> = {}

    const title = typeof body.title === 'string' ? body.title : ''
    if (typeof body.title !== 'string' || title.length < 3 || title.length > 120) {
      errors.title = ['The title must be between 3 and 120 characters.']
    }

    let description: string | null = null
    if (body.description !== undefined && body.description !== null) {
      if (typeof body.description !== 'string' || body.description.length > 400) {
        errors.description = ['The description may not be greater than 400 characters.']
      } else {
        description = body.description
      }
    }

    let meetingType = 'RAPAT_TIM'
    if (body.meetingType !== undefined && body.meetingType !== null) {
      if (!MEETING_TYPES.includes(body.meetingType)) {
        errors.meetingType = ['The selected meeting type is invalid.']
      } else {
        meetingType = body.meetingType
      }
    }

    const startAt = body.startAt != null ? new Date(body.startAt) : null
    if (body.startAt == null || !startAt || isNaN(startAt.getTime())) {
      errors.startAt = ['The startAt field is required and must be a valid date.']
    }

    const endAt = body.endAt != null ? new Date(body.endAt) : null
    if (body.endAt == null || !endAt || isNaN(endAt.getTime())) {
      errors.endAt = ['The endAt field is required and must be a valid date.']
    } else if (startAt && !isNaN(startAt.getTime()) && endAt.getTime() <= startAt.getTime()) {
      errors.endAt = ['The endAt must be a date after startAt.']
    }

    let location: string | null = null
    if (body.location !== undefined && body.location !== null) {
      if (typeof body.location !== 'string' || body.location.length > 200) {
        errors.location = ['The location may not be greater than 200 characters.']
      } else {
        location = body.location
      }
    }

    let linkedProgramId: number | null = null
    if (body.linkedProgramId !== undefined && body.linkedProgramId !== null) {
      if (!Number.isInteger(body.linkedProgramId)) {
        errors.linkedProgramId = ['The linkedProgramId must be an integer.']
      } else {
        linkedProgramId = body.linkedProgramId
      }
    }

    const rawAttendees: Array<{ userId: number; attendeeRole?: string }> = []
    if (body.attendees !== undefined && body.attendees !== null) {
      if (!Array.isArray(body.attendees)) {
        errors.attendees = ['The attendees must be an array.']
      } else {
        body.attendees.forEach((a: unknown, i: number) => {
          const at = a as { userId?: unknown; attendeeRole?: unknown }
          if (!Number.isInteger(at?.userId)) {
            errors[`attendees.${i}.userId`] = ['The attendee userId must be an integer.']
          }
          if (
            at?.attendeeRole !== undefined &&
            at?.attendeeRole !== null &&
            !['REQUIRED', 'OPTIONAL'].includes(at.attendeeRole as string)
          ) {
            errors[`attendees.${i}.attendeeRole`] = ['The selected attendeeRole is invalid.']
          } else if (Number.isInteger(at?.userId)) {
            rawAttendees.push({
              userId: at.userId as number,
              attendeeRole: (at.attendeeRole as string) ?? undefined,
            })
          }
        })
      }
    }

    if (Object.keys(errors).length) abortValidation(errors)

    // Program existence check (Laravel exists:Program,id).
    if (linkedProgramId) {
      const program = await prisma.program.findUnique({ where: { id: linkedProgramId } })
      if (!program) abortValidation({ linkedProgramId: ['The selected linkedProgramId is invalid.'] })
      // NOTE: cross-directorate scope check (ProgramService::assertAccess) not ported
    }

    const organizerId = user.id

    // Dedup by userId, cap 101.
    const seen = new Set<number>()
    const deduped: Array<{ userId: number; attendeeRole?: string }> = []
    for (const a of rawAttendees) {
      if (seen.has(a.userId)) continue
      seen.add(a.userId)
      deduped.push(a)
      if (deduped.length >= 101) break
    }

    const nonOrganizer = deduped.filter((a) => a.userId !== organizerId)
    if (nonOrganizer.length > 100) {
      abortValidation({ general: ['A maximum of 100 attendees per meeting is allowed.'] })
    }

    const meeting = await prisma.$transaction(async (tx) => {
      const m = await tx.meeting.create({
        data: {
          title: title.trim(),
          description: (description ?? '').trim(),
          meetingType,
          startAt: startAt!,
          endAt: endAt!,
          location: (location ?? '').trim(),
          organizerId,
          linkedProgramId,
          status: 'SCHEDULED',
        },
      })

      // Organizer auto-added as HADIR.
      await tx.meetingAttendee.create({
        data: {
          meetingId: m.id,
          userId: organizerId,
          attendeeRole: 'ORGANIZER',
          rsvpStatus: 'HADIR',
          respondedAt: new Date(),
        },
      })

      for (const a of nonOrganizer) {
        await tx.meetingAttendee.create({
          data: {
            meetingId: m.id,
            userId: a.userId,
            attendeeRole: a.attendeeRole ?? 'REQUIRED',
            rsvpStatus: 'PENDING',
          },
        })
      }

      return m
    })

    const inviteeIds = nonOrganizer.map((a) => a.userId)
    await notifyMeetingUsers(
      inviteeIds,
      'MEETING_INVITED',
      `You have been invited to the meeting "${meeting.title}" on ${formatMeetingWhen(meeting.startAt)}.`,
      meeting.id,
    )

    const fresh = await prisma.meeting.findUnique({
      where: { id: meeting.id },
      include: MEETING_INCLUDE,
    })
    const enriched = (await enrichMeetings([fresh as never]))[0]

    return NextResponse.json({ data: enriched }, { status: 201 })
  })
}
