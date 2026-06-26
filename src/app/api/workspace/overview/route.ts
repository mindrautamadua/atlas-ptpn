import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { listProgramsForUser } from '@/lib/programs'
import { buildProgramSummary } from '@/lib/program-summary'
import { orgScopeForUser } from '@/lib/org-scope'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Bundled overview consumed by WorkspaceProvider.loadOverview(). Combines the
 * slices HomeView + ProgramsView read:
 *   - programs       (Inertia `Program[]`, GET /programs shape)
 *   - programSummary (GET /organization/program-summary, ProgramSummaryPayload)
 *   - apmsKpis       (GET /apms/kpi — empty when AGHRIS not connected)
 *   - dashboard      (GET /workspace/overview, DashboardPayload)
 */
export async function GET() {
  const user = await requireUser()
  const scopeUser = {
    id: user.id,
    roleType: user.roleType,
    unitId: user.unitId,
    directorateId: user.directorateId,
  }

  const [programs, programSummary, dashboard] = await Promise.all([
    listProgramsForUser(scopeUser),
    buildProgramSummary(scopeUser),
    buildDashboard(scopeUser),
  ])

  return NextResponse.json({
    programs,
    programSummary,
    dashboard,
    apmsKpis: [],
    apmsMeta: { tahun: new Date().getFullYear(), bulan: new Date().getMonth() + 1, source: 'apms', connected: false },
    apmsLinkedPrograms: {},
  })
}

async function buildDashboard(user: { id: number; roleType: string | null; unitId: number | null; directorateId: number | null }) {
  const scope = await orgScopeForUser(user)
  const isExecutive = scope.isExecutive
  const unitIds = scope.unitIds.length ? scope.unitIds : [0]

  const programWhere = {
    archivedAt: null,
    ...(isExecutive ? {} : { ownerUnitId: { in: unitIds } }),
  }

  const [allPrograms, programRows, criticalBlockers, onlineUsers, unreadNotifications, leadingKpis, tasksDue, controlBlockers] = await Promise.all([
    prisma.program.findMany({ where: programWhere, select: { id: true, approvalStatus: true, healthStatus: true } }),
    prisma.program.findMany({
      where: programWhere,
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { id: true, name: true, progressPercent: true, healthStatus: true, strategicAlignment: true },
    }),
    prisma.blocker.count({
      where: {
        severity: 'CRITICAL',
        status: { not: 'RESOLVED' },
        ...(isExecutive ? {} : { workItem: { initiative: { program: { ownerUnitId: { in: unitIds } } } } }),
      },
    }),
    prisma.userStatus.count({ where: { status: 'ONLINE' } }),
    prisma.notification.count({ where: { userId: user.id, state: 'UNREAD' } }),
    prisma.kpiDefinition.findMany({
      where: { isLeadingIndicator: true },
      take: 10,
      select: { id: true, name: true, actualValue: true, targetValue: true, warningThreshold: true, criticalThreshold: true },
    }),
    prisma.workItem.findMany({
      where: {
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
        ...(isExecutive ? {} : { initiative: { program: { ownerUnitId: { in: unitIds } } } }),
      },
      orderBy: { targetCompletion: 'asc' },
      take: 10,
      select: { id: true, code: true, title: true, targetCompletion: true, status: true },
    }),
    prisma.blocker.findMany({
      where: {
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        ...(isExecutive ? {} : { workItem: { initiative: { program: { ownerUnitId: { in: unitIds } } } } }),
      },
      take: 10,
      select: { id: true, code: true, title: true, status: true, severity: true },
    }),
  ])

  const kpiStatus = (k: { actualValue: unknown; targetValue: unknown; warningThreshold: unknown; criticalThreshold: unknown }) => {
    const actual = Number(k.actualValue ?? 0)
    const target = Number(k.targetValue)
    const critical = k.criticalThreshold !== null ? Number(k.criticalThreshold) : target * 0.8
    const warning = k.warningThreshold !== null ? Number(k.warningThreshold) : target * 0.95
    if (actual <= critical) return 'RED'
    if (actual <= warning) return 'YELLOW'
    return 'GREEN'
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalPrograms: allPrograms.length,
      activePrograms: allPrograms.filter((p) => p.approvalStatus === 'ACTIVE').length,
      redPrograms: allPrograms.filter((p) => p.healthStatus === 'RED').length,
      criticalBlockers,
      onlineUsers,
      unreadNotifications,
    },
    dimensions: {
      strategic: programRows.map((p) => ({ programId: p.id, program: p.name, strategicAlignment: p.strategicAlignment ?? 0, healthStatus: p.healthStatus ?? 'YELLOW' })),
      programs: programRows.map((p) => ({ id: p.id, name: p.name, progressPercent: p.progressPercent ?? 0, blockerCount: 0, healthStatus: p.healthStatus ?? 'YELLOW' })),
      leadingIndicators: leadingKpis.map((k) => ({ id: k.id, name: k.name, actualValue: k.actualValue == null ? null : Number(k.actualValue), targetValue: Number(k.targetValue), status: kpiStatus(k) })),
      timeIntelligence: tasksDue.map((t) => ({ id: t.id, code: t.code, title: t.title, targetCompletion: t.targetCompletion.toISOString(), status: t.status })),
      accountability: [],
      // NOTE: FE normalizes `governance` → `controls`.
      governance: controlBlockers.map((b) => ({ id: b.id, code: b.code, title: b.title, status: b.status, severity: b.severity })),
      performance: [],
      collaboration: [],
    },
    recentActivity: [],
    mentions: [],
    onlineUsers: [],
  }
}
