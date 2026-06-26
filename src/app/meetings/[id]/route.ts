import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withUser, abort, abortValidation } from '@/lib/http-route'
import {
  enrichMeetings,
  hasMeetingAccess,
  notifyMeetingUsers,
  formatMeetingWhen,
  canSeeAll,
} from '@/lib/meetings'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

const MEETING_TYPES = [
  'RAPAT_DIREKSI',
  'RAPAT_KOORDINASI',
  'RAPAT_DIVISI',
  'RAPAT_TIM',
  'ONE_ON_ONE',
]
const STATUSES = ['SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED', 'POSTPONED']

/** Port of MeetingController::show. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  return withUser(async (user) => {
    const { id } = await params
    const meetingId = Number(id)

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { attendees: true, decisions: true, actionItems: true },
    })
    if (!meeting) abort(404, 'Meeting not found.')

    if (!hasMeetingAccess(meeting, user.id, user.roleType)) {
      abort(403, 'You do not have access to this meeting.')
    }

    const enriched = (await enrichMeetings([meeting as never]))[0]
    return NextResponse.json({ data: enriched })
  })
}

/** Port of MeetingController::update. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return withUser(async (user) => {
    const { id } = await params
    const meetingId = Number(id)

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } })
    if (!meeting) abort(404, 'Meeting not found.')

    if (meeting.organizerId !== user.id) {
      abort(403, 'Only the organizer can edit the meeting.')
    }

    const body = await req.json().catch(() => ({}))
    const errors: Record<string, string[]> = {}

    const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)

    // ── Validation (mirror Laravel validate() — `sometimes` rules) ──────────
    if (has('title')) {
      if (typeof body.title !== 'string' || body.title.length < 3 || body.title.length > 120) {
        errors.title = ['The title must be between 3 and 120 characters.']
      }
    }
    if (has('description') && body.description !== null) {
      if (typeof body.description !== 'string' || body.description.length > 400) {
        errors.description = ['The description may not be greater than 400 characters.']
      }
    }
    if (has('meetingType')) {
      if (!MEETING_TYPES.includes(body.meetingType)) {
        errors.meetingType = ['The selected meeting type is invalid.']
      }
    }
    let startAtParsed: Date | null = null
    if (has('startAt')) {
      startAtParsed = new Date(body.startAt)
      if (isNaN(startAtParsed.getTime())) errors.startAt = ['The startAt must be a valid date.']
    }
    let endAtParsed: Date | null = null
    if (has('endAt')) {
      endAtParsed = new Date(body.endAt)
      if (isNaN(endAtParsed.getTime())) errors.endAt = ['The endAt must be a valid date.']
    }
    if (has('location') && body.location !== null) {
      if (typeof body.location !== 'string' || body.location.length > 200) {
        errors.location = ['The location may not be greater than 200 characters.']
      }
    }
    if (has('notes') && body.notes !== null) {
      if (typeof body.notes !== 'string' || body.notes.length > 8000) {
        errors.notes = ['The notes may not be greater than 8000 characters.']
      }
    }
    let linkedProgramId: number | null | undefined = undefined
    if (has('linkedProgramId') && body.linkedProgramId !== null) {
      if (!Number.isInteger(body.linkedProgramId)) {
        errors.linkedProgramId = ['The linkedProgramId must be an integer.']
      } else {
        linkedProgramId = body.linkedProgramId
      }
    } else if (has('linkedProgramId')) {
      linkedProgramId = null
    }
    if (has('status')) {
      if (!STATUSES.includes(body.status)) {
        errors.status = ['The selected status is invalid.']
      }
    }
    if (has('postponedReason') && body.postponedReason !== null) {
      if (typeof body.postponedReason !== 'string' || body.postponedReason.length > 300) {
        errors.postponedReason = ['The postponedReason may not be greater than 300 characters.']
      }
    }

    if (Object.keys(errors).length) abortValidation(errors)

    // Program existence check (Laravel exists:Program,id).
    if (linkedProgramId) {
      const program = await prisma.program.findUnique({ where: { id: linkedProgramId } })
      if (!program) abortValidation({ linkedProgramId: ['The selected linkedProgramId is invalid.'] })
      // NOTE: cross-directorate scope check (ProgramService::assertAccess) not ported
    }

    // ── Status transition guards ────────────────────────────────────────────
    const status: string | undefined = has('status') ? body.status : undefined
    const postponedReason: string | undefined =
      has('postponedReason') && body.postponedReason ? body.postponedReason : undefined

    if (status) {
      const now = new Date()

      if (status === 'ONGOING' && meeting.status !== 'SCHEDULED') {
        abortValidation({ general: ['Only meetings with the Scheduled status can be started.'] })
      }
      if (status === 'ONGOING') {
        const earliest = new Date(meeting.startAt.getTime() - 15 * 60 * 1000)
        if (now.getTime() < earliest.getTime()) {
          abortValidation({
            general: [
              'The meeting cannot be started yet — too early (max 15 minutes before the scheduled time).',
            ],
          })
        }
      }
      if (status === 'COMPLETED' && !['SCHEDULED', 'ONGOING'].includes(meeting.status)) {
        abortValidation({
          general: ['A meeting can only be completed from the Scheduled or Ongoing status.'],
        })
      }
      if (status === 'POSTPONED') {
        if (!['SCHEDULED', 'ONGOING'].includes(meeting.status)) {
          abortValidation({ general: ['Only Scheduled/Ongoing meetings can be postponed.'] })
        }
        if (!postponedReason) {
          abortValidation({ general: ['A reason for postponement is required.'] })
        }
      }
      if (status === 'SCHEDULED' && meeting.status !== 'POSTPONED') {
        abortValidation({ general: ['Only Postponed meetings can be rescheduled.'] })
      }
      if (status === 'CANCELLED' && meeting.status === 'COMPLETED') {
        abortValidation({ general: ['A completed meeting cannot be cancelled.'] })
      }
    }

    // ── Build update payload (mirror array_filter not-null semantics) ───────
    const updateData: Record<string, unknown> = {}
    if (has('title')) updateData.title = body.title.trim()
    if (has('description')) updateData.description = (body.description ?? '').trim()
    if (has('meetingType') && body.meetingType) updateData.meetingType = body.meetingType
    if (has('location')) updateData.location = (body.location ?? '').trim()
    if (has('notes')) updateData.notes = (body.notes ?? '').trim()
    if (linkedProgramId) updateData.linkedProgramId = linkedProgramId
    if (status) updateData.status = status

    if (startAtParsed) {
      // Track reschedule.
      if (!meeting.rescheduledFromAt) updateData.rescheduledFromAt = meeting.startAt
      updateData.startAt = startAtParsed
    }
    if (endAtParsed) updateData.endAt = endAtParsed
    if (postponedReason) updateData.postponedReason = postponedReason.trim()
    if (status === 'SCHEDULED') updateData.postponedReason = null

    const prevStartAt = meeting.startAt
    const prevEndAt = meeting.endAt
    const prevStatus = meeting.status

    await prisma.$transaction(async (tx) => {
      // Optimistic concurrency check for status transitions.
      if (status) {
        const current = await tx.meeting.findUnique({
          where: { id: meeting.id },
          select: { status: true },
        })
        if (current?.status !== meeting.status) {
          abort(409, 'The meeting status has changed. Please refresh and try again.')
        }
      }
      await tx.meeting.update({ where: { id: meeting.id }, data: updateData })
    })

    // ── Notification side-effects (best-effort) ─────────────────────────────
    const refreshed = await prisma.meeting.findUnique({
      where: { id: meeting.id },
      include: { attendees: true },
    })
    if (refreshed) {
      const attendeeIds = refreshed.attendees
        .filter((a) => a.userId !== refreshed.organizerId)
        .map((a) => a.userId)

      if (attendeeIds.length) {
        const newStatus = (updateData.status as string) ?? prevStatus
        let handled = false
        if (newStatus !== prevStatus) {
          if (newStatus === 'CANCELLED') {
            await notifyMeetingUsers(
              attendeeIds,
              'MEETING_CANCELLED',
              `Meeting "${refreshed.title}" dibatalkan.`,
              refreshed.id,
            )
            handled = true
          } else if (newStatus === 'POSTPONED') {
            const reason = refreshed.postponedReason
              ? ` Alasan: ${refreshed.postponedReason}`
              : ''
            await notifyMeetingUsers(
              attendeeIds,
              'MEETING_POSTPONED',
              `Meeting "${refreshed.title}" ditunda.${reason}`,
              refreshed.id,
            )
            handled = true
          }
        }

        if (!handled) {
          const rescheduled =
            ('startAt' in updateData &&
              String(refreshed.startAt) !== String(prevStartAt)) ||
            ('endAt' in updateData && String(refreshed.endAt) !== String(prevEndAt))
          if (rescheduled) {
            await notifyMeetingUsers(
              attendeeIds,
              'MEETING_UPDATED',
              `Meeting "${refreshed.title}" dijadwalkan ulang ke ${formatMeetingWhen(refreshed.startAt)}.`,
              refreshed.id,
            )
          }
        }
      }
    }

    const fresh = await prisma.meeting.findUnique({
      where: { id: meeting.id },
      include: { attendees: true, decisions: true, actionItems: true },
    })
    const enriched = (await enrichMeetings([fresh as never]))[0]

    return NextResponse.json({ data: enriched })
  })
}

/** Port of MeetingController::destroy. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return withUser(async (user) => {
    const { id } = await params
    const meetingId = Number(id)

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } })
    if (!meeting) abort(404, 'Meeting not found.')

    if (meeting.organizerId !== user.id && !canSeeAll(user.roleType)) {
      abort(403, 'Only the organizer can cancel the meeting.')
    }
    if (meeting.status === 'COMPLETED') {
      abortValidation({ general: ['A completed meeting cannot be cancelled.'] })
    }

    await prisma.meeting.update({ where: { id: meeting.id }, data: { status: 'CANCELLED' } })

    const attendees = await prisma.meetingAttendee.findMany({
      where: { meetingId: meeting.id, userId: { not: meeting.organizerId } },
      select: { userId: true },
    })
    await notifyMeetingUsers(
      attendees.map((a) => a.userId),
      'MEETING_CANCELLED',
      `Meeting "${meeting.title}" was cancelled.`,
      meeting.id,
    )

    return NextResponse.json({ ok: true })
  })
}
