import { NextRequest, NextResponse } from 'next/server'
import { withUser, abort, abortValidation } from '@/lib/http-route'
import { prisma } from '@/lib/db'
import { hasMeetingAccess, notifyMeetingUsers } from '@/lib/meetings'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** Format a date as "d M Y" (Asia/Jakarta) — mirrors PHP Carbon::format('d M Y'). */
function formatDueDate(d: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta',
  }).format(d)
}

/** GET /meetings/{id}/action-items — port of MeetingController::listActionItems. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  return withUser(async (user) => {
    const { id } = await params
    const meetingId = Number(id)

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { attendees: { select: { userId: true } } },
    })
    if (!meeting) abort(404, 'Meeting not found.')
    if (!hasMeetingAccess(meeting, user.id, user.roleType)) {
      abort(403, 'You do not have access to this meeting.')
    }

    const items = await prisma.meetingActionItem.findMany({
      where: { meetingId },
      orderBy: { createdAt: 'asc' },
    })

    const assignedIds = [
      ...new Set(items.map((i) => i.assignedToId).filter((v): v is number => !!v)),
    ]
    const users = await prisma.user.findMany({
      where: { id: { in: assignedIds } },
      select: { id: true, name: true, avatarUrl: true, roleType: true },
    })
    const userMap = new Map(users.map((u) => [u.id, u]))

    return NextResponse.json({
      data: items.map((i) => ({
        ...i,
        assignedTo: i.assignedToId ? (userMap.get(i.assignedToId) ?? null) : null,
      })),
    })
  })
}

/** POST /meetings/{id}/action-items — port of MeetingController::storeActionItem. */
export async function POST(req: NextRequest, { params }: Ctx) {
  return withUser(async (user) => {
    const { id } = await params
    const meetingId = Number(id)

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } })
    if (!meeting) abort(404, 'Meeting not found.')

    // Only the organizer can add action items.
    if (meeting.organizerId !== user.id) abort(403, 'Only the organizer can add action items.')

    if (['CANCELLED', 'COMPLETED', 'POSTPONED'].includes(meeting.status)) {
      abortValidation({
        general: ['Cannot add an action item to a meeting that is postponed, cancelled, or completed.'],
      })
    }

    const count = await prisma.meetingActionItem.count({ where: { meetingId } })
    if (count >= 100) {
      abortValidation({ general: ['The action item limit per meeting has been reached (maximum 100).'] })
    }

    const body = await req.json().catch(() => ({}))

    const title = typeof body.title === 'string' ? body.title : ''
    if (title.length < 3 || title.length > 200) {
      abortValidation({ title: ['The title must be between 3 and 200 characters.'] })
    }
    const description = body.description ?? null
    if (description != null && (typeof description !== 'string' || description.length > 400)) {
      abortValidation({ description: ['The description may not be greater than 400 characters.'] })
    }
    const assignedToId =
      body.assignedToId == null || body.assignedToId === '' ? null : Number(body.assignedToId)
    if (assignedToId != null && !Number.isInteger(assignedToId)) {
      abortValidation({ assignedToId: ['The assignedToId must be an integer.'] })
    }
    let dueDate: Date | null = null
    if (body.dueDate != null && body.dueDate !== '') {
      dueDate = new Date(body.dueDate)
      if (Number.isNaN(dueDate.getTime())) {
        abortValidation({ dueDate: ['The dueDate is not a valid date.'] })
      }
      // after_or_equal:today — compare on date boundary.
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (dueDate < today) {
        abortValidation({ dueDate: ['The dueDate must be a date after or equal to today.'] })
      }
    }

    // Assignee must be the organizer or an attendee, and not TIDAK_HADIR/DELEGASI.
    if (assignedToId) {
      const isOrganizer = meeting.organizerId === assignedToId
      const attendee = isOrganizer
        ? null
        : await prisma.meetingAttendee.findFirst({
            where: { meetingId, userId: assignedToId },
          })
      if (!isOrganizer && !attendee) {
        abortValidation({ general: ['The assigned user must be an attendee of this meeting.'] })
      }
      if (attendee && ['TIDAK_HADIR', 'DELEGASI'].includes(attendee.rsvpStatus)) {
        abortValidation({
          general: ['Cannot assign an action item to an attendee who is not attending or has delegated.'],
        })
      }
    }

    const item = await prisma.meetingActionItem.create({
      data: {
        meetingId,
        title: title.trim(),
        description,
        assignedToId,
        dueDate,
        status: 'OPEN',
      },
    })

    if (assignedToId && assignedToId !== user.id) {
      const due = dueDate ? ` (deadline ${formatDueDate(dueDate)})` : ''
      await notifyMeetingUsers(
        [assignedToId],
        'ACTION_ITEM_ASSIGNED',
        `New action item in the meeting "${meeting.title}": ${item.title}${due}.`,
        meetingId,
      )
    }

    return NextResponse.json({ data: item }, { status: 201 })
  })
}
