import 'server-only'
import { prisma } from '@/lib/db'
import { notifyUser } from '@/lib/broadcast'

/**
 * Shared Meeting-domain helpers — port of the private helpers in
 * App\Http\Controllers\MeetingController (enrichMeetings, queryMeetings,
 * buildContinuity, assertAccess, notifyMeetingUsers).
 */

const SEE_ALL_ROLES = ['BOD', 'ADMIN', 'SUPERADMIN']

/** Mirror MeetingController::canSeeAll — portfolio-wide visibility. */
export function canSeeAll(role: string | null | undefined): boolean {
  return SEE_ALL_ROLES.includes((role ?? '').toUpperCase())
}

const USER_SELECT = {
  id: true,
  name: true,
  avatarUrl: true,
  roleType: true,
  positionTitle: true,
  unit: { select: { id: true, code: true, name: true } },
} as const

type MeetingWithAttendees = Awaited<ReturnType<typeof prisma.meeting.findFirst>> & {
  attendees: Array<{
    id: number
    meetingId: number
    userId: number
    attendeeRole: string
    rsvpStatus: string
    delegateToId: number | null
    delegateNote: string | null
    respondedAt: Date | null
    createdAt: Date
  }>
}

/** Include clause to load attendees alongside a meeting. */
export const MEETING_INCLUDE = { attendees: true } as const

/**
 * Attach `organizer` + per-attendee `user`/`delegateTo`. Mirrors
 * MeetingController::enrichMeetings (no FK relations on Meeting → manual fetch).
 */
export async function enrichMeetings(
  meetings: MeetingWithAttendees[],
): Promise<Record<string, unknown>[]> {
  if (meetings.length === 0) return []

  const userIds = new Set<number>()
  for (const m of meetings) {
    userIds.add(m.organizerId)
    for (const a of m.attendees) {
      userIds.add(a.userId)
      if (a.delegateToId) userIds.add(a.delegateToId)
    }
  }

  const users = await prisma.user.findMany({
    where: { id: { in: [...userIds] } },
    select: USER_SELECT,
  })
  const userMap = new Map(users.map((u) => [u.id, u]))

  return meetings.map((m) => ({
    ...m,
    organizer: userMap.get(m.organizerId) ?? null,
    attendees: m.attendees.map((a) => ({
      ...a,
      user: userMap.get(a.userId) ?? null,
      delegateTo: a.delegateToId ? (userMap.get(a.delegateToId) ?? null) : null,
    })),
  }))
}

export type MeetingQueryParams = {
  filter?: string | null
  from?: string | null
  to?: string | null
  forUserId?: string | null
}

/** Port of MeetingController::queryMeetings — scoped, ordered, enriched. */
export async function queryMeetings(
  user: { id: number; roleType: string | null },
  params: MeetingQueryParams,
): Promise<Record<string, unknown>[]> {
  const filter = params.filter ?? 'upcoming'
  const { from, to, forUserId } = params
  const now = new Date()

  const and: Record<string, unknown>[] = []

  if (from && to) and.push({ startAt: { gte: new Date(from), lte: new Date(to) } })
  else if (from) and.push({ startAt: { gte: new Date(from) } })
  else if (to) and.push({ startAt: { lte: new Date(to) } })
  else if (filter === 'past') and.push({ endAt: { lt: now } })

  if (!from && !to && filter === 'upcoming') {
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
    and.push({ OR: [{ startAt: { gte: twoHoursAgo } }, { status: 'POSTPONED' }] })
  }

  if (forUserId) {
    const target = Number(forUserId)
    and.push({ status: { not: 'CANCELLED' } })
    and.push({ OR: [{ organizerId: target }, { attendees: { some: { userId: target } } }] })
  } else if (!canSeeAll(user.roleType)) {
    and.push({ OR: [{ organizerId: user.id }, { attendees: { some: { userId: user.id } } }] })
  }

  const meetings = await prisma.meeting.findMany({
    where: and.length ? { AND: and } : {},
    orderBy: { startAt: 'asc' },
    take: 500,
    include: MEETING_INCLUDE,
  })

  return enrichMeetings(meetings as unknown as MeetingWithAttendees[])
}

/** Participant or portfolio-visibility check. Returns true when access is allowed. */
export function hasMeetingAccess(
  meeting: { organizerId: number; attendees: Array<{ userId: number }> },
  userId: number,
  role: string | null,
): boolean {
  const isParticipant =
    meeting.organizerId === userId || meeting.attendees.some((a) => a.userId === userId)
  return isParticipant || canSeeAll(role)
}

/** Port of MeetingController::buildContinuity. */
export async function buildContinuity(meeting: {
  id: number
  startAt: Date
  status: string
  linkedProgramId: number | null
  meetingType: string
  organizerId: number
}): Promise<Record<string, unknown>> {
  const prevMeeting = await prisma.meeting.findFirst({
    where: {
      id: { not: meeting.id },
      startAt: { lt: meeting.startAt },
      status: { in: ['COMPLETED', 'SCHEDULED', 'ONGOING'] },
      ...(meeting.linkedProgramId
        ? { linkedProgramId: meeting.linkedProgramId }
        : { meetingType: meeting.meetingType, organizerId: meeting.organizerId }),
    },
    orderBy: { startAt: 'desc' },
    select: { id: true, title: true, startAt: true },
  })

  if (!prevMeeting) {
    return { previousMeeting: null, unresolvedItems: [], completionRate: null, totalItems: 0 }
  }

  const allItems = await prisma.meetingActionItem.findMany({
    where: { meetingId: prevMeeting.id },
    orderBy: { createdAt: 'asc' },
  })
  const unresolved = allItems.filter((i) => i.status !== 'COMPLETED')
  const completionRate = allItems.length
    ? Math.round(((allItems.length - unresolved.length) / allItems.length) * 100)
    : null

  const assignedIds = [...new Set(unresolved.map((i) => i.assignedToId).filter((v): v is number => !!v))]
  const users = await prisma.user.findMany({
    where: { id: { in: assignedIds } },
    select: { id: true, name: true, avatarUrl: true, roleType: true },
  })
  const userMap = new Map(users.map((u) => [u.id, u]))

  return {
    previousMeeting: prevMeeting,
    unresolvedItems: unresolved.map((i) => ({
      ...i,
      assignedTo: i.assignedToId ? (userMap.get(i.assignedToId) ?? null) : null,
    })),
    completionRate,
    totalItems: allItems.length,
  }
}

/** Port of MeetingController::notifyMeetingUsers — Notification + broadcast per recipient. */
export async function notifyMeetingUsers(
  userIds: number[],
  type: string,
  message: string,
  meetingId: number,
): Promise<void> {
  const ids = [...new Set(userIds.map((n) => Number(n)).filter((id) => id > 0))]
  for (const uid of ids) {
    try {
      await notifyUser(uid, type, message, `meeting:${meetingId}`)
    } catch {
      /* best-effort, mirrors PHP rescue() */
    }
  }
}

/** Format a Date as "d M Y H:i" (Asia/Jakarta) for notification copy. */
export function formatMeetingWhen(d: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'Asia/Jakarta',
  }).format(d)
}
