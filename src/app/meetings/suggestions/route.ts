import { NextRequest, NextResponse } from 'next/server'
import { withUser } from '@/lib/http-route'
import { prisma } from '@/lib/db'
import { orgScopeForUser } from '@/lib/org-scope'

export const dynamic = 'force-dynamic'

/**
 * GET /meetings/suggestions — port of MeetingController::suggestions.
 * Surfaces at-risk programs without a recent linked meeting as meeting prompts.
 */
export async function GET(_req: NextRequest) {
  return withUser(async (user) => {
    const scope = await orgScopeForUser({
      id: user.id,
      roleType: user.roleType,
      unitId: user.unitId,
      directorateId: user.directorateId,
    })
    const role = scope.role

    // STAF/OFFICER/ASISTEN → personal queue (owned). KADIV/KASUBDIV → org scope.
    // BOD/ADMIN → portfolio-wide.
    const personalOnly = !scope.isExecutive && !['KADIV', 'KASUBDIV'].includes(role)

    const where: Record<string, unknown> = {
      healthStatus: { in: ['RED', 'YELLOW'] },
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
    }
    if (personalOnly) {
      where.ownerId = user.id
    } else if (!scope.isExecutive) {
      where.ownerUnitId = { in: scope.unitIds.length ? scope.unitIds : [0] }
    }

    const programs = await prisma.program.findMany({
      where,
      select: {
        id: true,
        name: true,
        code: true,
        healthStatus: true,
        progressPercent: true,
        ownerId: true,
      },
      // RED before YELLOW, then least-progressed first.
      orderBy: [{ healthStatus: 'desc' }, { progressPercent: 'asc' }],
      take: 10,
    })
    // Prisma cannot express the PHP CASE health ordering directly; 'desc' on the
    // string puts YELLOW before RED, so re-sort RED→YELLOW then progress asc.
    const healthRank = (h: string | null) => (h === 'RED' ? 1 : h === 'YELLOW' ? 2 : 3)
    programs.sort((a, b) => {
      const r = healthRank(a.healthStatus) - healthRank(b.healthStatus)
      if (r !== 0) return r
      return a.progressPercent - b.progressPercent
    })

    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    const now = new Date()

    const suggestions: Record<string, unknown>[] = []
    for (const prog of programs) {
      const lastRecent = await prisma.meeting.findFirst({
        where: {
          linkedProgramId: prog.id,
          status: { not: 'CANCELLED' },
          startAt: { gte: cutoff },
        },
        select: { id: true },
      })
      if (lastRecent) continue

      const criticalBlockers = await prisma.blocker.count({
        where: {
          severity: { in: ['CRITICAL', 'HIGH'] },
          status: { not: 'RESOLVED' },
          workItem: { initiative: { programId: prog.id } },
        },
      })

      const lastMeeting = await prisma.meeting.findFirst({
        where: { linkedProgramId: prog.id, status: { not: 'CANCELLED' } },
        orderBy: { startAt: 'desc' },
        select: { startAt: true },
      })

      const daysSince = lastMeeting?.startAt
        ? Math.floor((now.getTime() - new Date(lastMeeting.startAt).getTime()) / (24 * 60 * 60 * 1000))
        : null

      suggestions.push({
        type:
          prog.healthStatus === 'RED'
            ? 'PROGRAM_HEALTH'
            : criticalBlockers >= 3
              ? 'BLOCKER_ESCALATION'
              : 'PROGRAM_HEALTH',
        programId: prog.id,
        programName: prog.name,
        programCode: prog.code,
        programHealth: prog.healthStatus,
        progressPercent: prog.progressPercent,
        criticalBlockerCount: criticalBlockers,
        daysSinceLastMeeting: daysSince,
        suggestedType: prog.healthStatus === 'RED' ? 'RAPAT_KOORDINASI' : 'RAPAT_DIVISI',
        suggestedTitle:
          prog.healthStatus === 'RED' ? `Eskalasi: ${prog.name}` : `Review: ${prog.name}`,
      })
    }

    return NextResponse.json({ data: suggestions })
  })
}
