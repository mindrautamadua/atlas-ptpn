import { NextRequest, NextResponse } from 'next/server'
import { withUser, abort } from '@/lib/http-route'
import { prisma } from '@/lib/db'
import { hasMeetingAccess, buildContinuity } from '@/lib/meetings'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * GET /meetings/{id}/pica-context — port of MeetingController::picaContext.
 * Composite PICA panel: open blockers + latest progress log + continuity.
 * Only relevant for meetings linked to a program.
 */
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

    if (!meeting.linkedProgramId) {
      return NextResponse.json({
        data: null,
        note: 'This meeting is not linked to a program. The PICA panel is only relevant for RAPAT_KOORDINASI with a linked program.',
      })
    }

    const programId = meeting.linkedProgramId

    // 1. Open blockers — via workItem.initiative.programId. Blocker has no
    // assignee/creator/task relations → fetch task via `workItem` and users
    // manually. Severity ordering CRITICAL→HIGH→MEDIUM→LOW then createdAt.
    const blockers = await prisma.blocker.findMany({
      where: {
        status: { not: 'RESOLVED' },
        workItem: { initiative: { programId } },
      },
      select: {
        id: true,
        code: true,
        title: true,
        description: true,
        severity: true,
        status: true,
        rootCause: true,
        resolution: true,
        workItemId: true,
        assignedTo: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
        workItem: { select: { id: true, title: true, initiativeId: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    })
    const sevRank = (s: string) =>
      s === 'CRITICAL' ? 1 : s === 'HIGH' ? 2 : s === 'MEDIUM' ? 3 : 4
    blockers.sort((a, b) => {
      const r = sevRank(a.severity) - sevRank(b.severity)
      if (r !== 0) return r
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })

    const blockerUserIds = [
      ...new Set(
        blockers
          .flatMap((b) => [b.assignedTo, b.createdBy])
          .filter((v): v is number => !!v),
      ),
    ]
    const blockerUsers = await prisma.user.findMany({
      where: { id: { in: blockerUserIds } },
      select: { id: true, name: true, roleType: true, positionTitle: true },
    })
    const userMap = new Map(blockerUsers.map((u) => [u.id, u]))

    const openBlockers = blockers.map(({ workItem, ...b }) => ({
      ...b,
      task: workItem ?? null,
      assignee: b.assignedTo
        ? (userMap.get(b.assignedTo)
            ? {
                id: userMap.get(b.assignedTo)!.id,
                name: userMap.get(b.assignedTo)!.name,
                roleType: userMap.get(b.assignedTo)!.roleType,
                positionTitle: userMap.get(b.assignedTo)!.positionTitle,
              }
            : null)
        : null,
      creator: b.createdBy
        ? (userMap.get(b.createdBy)
            ? { id: userMap.get(b.createdBy)!.id, name: userMap.get(b.createdBy)!.name }
            : null)
        : null,
    }))

    // 2. Latest progress log — most recent period.
    const latestProgressLog = await prisma.programProgressLog.findFirst({
      where: { programId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        period: true,
        healthAtTime: true,
        narrative: true,
        kendala: true,
        correctiveAction: true,
        nextStep: true,
        dukunganDibutuhkan: true,
        createdById: true,
        createdByName: true,
        createdAt: true,
      },
    })

    // 3. Continuity — re-use shared helper.
    const continuity = await buildContinuity(meeting)

    return NextResponse.json({
      data: { openBlockers, latestProgressLog, continuity },
    })
  })
}
