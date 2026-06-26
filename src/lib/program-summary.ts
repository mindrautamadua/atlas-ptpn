import 'server-only'
import { prisma } from '@/lib/db'
import { orgScopeForUser } from '@/lib/org-scope'

/**
 * Port of app/Services/OrgSummaryService.php::build() — the executive program
 * summary consumed by HomeView (and ProgramsView for byDivisi). Mirrors the
 * JSON shape of GET /organization/program-summary (ProgramSummaryPayload).
 *
 * Note: snapshot writes (saveToday) are omitted — read-only port. velocity +
 * trendSeries read from program_health_snapshots if present, else degrade.
 */

type SummaryUser = {
  id: number
  roleType: string | null
  unitId: number | null
  directorateId: number | null
}

type Tone = 'on_track' | 'at_risk' | 'terlambat' | 'overdue' | 'selesai' | 'draft'

const MS_DAY = 86_400_000
const diffDays = (a: Date, b: Date) => Math.trunc((b.getTime() - a.getTime()) / MS_DAY)

function toneLabel(tone: string): string {
  switch (tone) {
    case 'selesai': return 'Completed'
    case 'overdue': return 'Overdue'
    case 'terlambat': return 'Delayed'
    case 'on_track': return 'On Track'
    default: return 'At Risk'
  }
}

function classifyHealth(p: {
  status: string; approvalStatus: string; healthStatus: string | null; targetEndDate: Date | null
}, now: Date): Tone {
  if (p.status === 'COMPLETED' || p.approvalStatus === 'COMPLETED') return 'selesai'
  if (!p.approvalStatus || !['ACTIVE', 'COMPLETED'].includes(p.approvalStatus)) return 'draft'
  if (p.targetEndDate && now.getTime() > p.targetEndDate.getTime()) return 'overdue'
  if (p.healthStatus === 'RED') return 'terlambat'
  if (p.healthStatus === 'GREEN') return 'on_track'
  return 'at_risk'
}

function buildCounts(programs: Array<{ healthTone: Tone }>) {
  const count = (t: Tone) => programs.filter((p) => p.healthTone === t).length
  const total = programs.length
  const onTrack = count('on_track')
  const atRisk = count('at_risk')
  const terlambat = count('terlambat')
  const overdue = count('overdue')
  const selesai = count('selesai')
  const draft = count('draft')
  const operational = total - draft
  const pct = (n: number) => (operational > 0 ? Math.round((n / operational) * 100) : 0)
  return {
    total, onTrack, atRisk, terlambat, overdue, selesai, draft,
    pctOnTrack: pct(onTrack),
    pctAtRisk: pct(atRisk),
    pctTerlambat: pct(terlambat + overdue),
    pctSelesai: pct(selesai),
  }
}

export async function buildProgramSummary(user: SummaryUser) {
  const scope = await orgScopeForUser(user)
  const isExecutive = scope.isExecutive
  const now = new Date()

  const units = await prisma.organizationalUnit.findMany({
    where: isExecutive ? {} : { id: { in: scope.unitIds.length ? scope.unitIds : [0] } },
    orderBy: { code: 'asc' },
    select: { id: true, name: true, code: true, directorateId: true },
  })
  const unitIds = units.map((u) => u.id)

  // ── Programs scoped by ownerUnitId ────────────────────────────────────
  const programs = await prisma.program.findMany({
    where: {
      archivedAt: null,
      status: { not: 'CANCELLED' },
      approvalStatus: { in: ['ACTIVE', 'COMPLETED', 'DRAFT', 'PENDING_KASUB', 'PENDING_KADIV'] },
      ...(isExecutive ? {} : { ownerUnitId: { in: unitIds.length ? unitIds : [0] } }),
    },
    select: {
      id: true, code: true, name: true, ownerId: true, ownerUnitId: true, submittedById: true,
      healthStatus: true, status: true, priority: true, startDate: true, targetEndDate: true,
      progressPercent: true, approvalStatus: true, updatedAt: true, createdAt: true,
      kelompok: true, pilarStrategis: true, progresTerkini: true, dukunganDibutuhkan: true,
    },
  })

  const ownerIds = [...new Set(programs.map((p) => p.ownerId))]
  const owners = ownerIds.length
    ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } })
    : []
  const ownerMap = new Map(owners.map((o) => [o.id, o]))

  const classified = programs.map((p) => {
    const tone = classifyHealth(p, now)
    return { ...p, owner: ownerMap.get(p.ownerId) ?? null, healthTone: tone, healthLabel: toneLabel(tone) }
  })

  const unitById = new Map(units.map((u) => [u.id, u]))

  // ── Per-division breakdown ────────────────────────────────────────────
  const byDivisi: Array<Record<string, unknown>> = units.map((unit) => {
    const divPrograms = classified.filter((p) => p.ownerUnitId === unit.id)
    return { ...buildCounts(divPrograms), unit: { id: unit.id, name: unit.name, code: unit.code } }
  })
  const unassigned = classified.filter((p) => p.ownerUnitId == null || !unitIds.includes(p.ownerUnitId))
  if (unassigned.length > 0) {
    byDivisi.push({ ...buildCounts(unassigned), unit: { id: null, name: 'Unassigned', code: '-' } })
  }

  const overallCounts = buildCounts(classified)

  // ── Scorecard vs Non-Scorecard health ────────────────────────────────
  const scGroups = classified.filter((p) => ['ACTIVE', 'COMPLETED'].includes(p.approvalStatus))
  const scorecardHealth = (['SCORECARD', 'NON_SCORECARD'] as const).map((key) => {
    const group = scGroups.filter((p) => (p.kelompok ?? 'NON_SCORECARD') === key)
    return { kelompok: key, ...buildCounts(group) }
  })

  // ── Deadline clusters ─────────────────────────────────────────────────
  const activeProg = classified.filter((p) => !['COMPLETED', 'CANCELLED'].includes(p.status))
  const clusterBuckets: Array<{ label: string; programs: Array<{ tone: Tone; days: number | null }> }> = [
    { label: 'Overdue', programs: [] },
    { label: '≤ 30 days', programs: [] },
    { label: '31–60 days', programs: [] },
    { label: '61–90 days', programs: [] },
    { label: '90+ days', programs: [] },
    { label: 'No deadline', programs: [] },
  ]
  for (const p of activeProg) {
    const days = p.targetEndDate ? diffDays(now, p.targetEndDate) : null
    if (days === null) clusterBuckets[5].programs.push({ tone: p.healthTone, days: null })
    else if (days < 0) clusterBuckets[0].programs.push({ tone: p.healthTone, days })
    else if (days <= 30) clusterBuckets[1].programs.push({ tone: p.healthTone, days })
    else if (days <= 60) clusterBuckets[2].programs.push({ tone: p.healthTone, days })
    else if (days <= 90) clusterBuckets[3].programs.push({ tone: p.healthTone, days })
    else clusterBuckets[4].programs.push({ tone: p.healthTone, days })
  }
  const deadlineClusters = clusterBuckets
    .map((c) => ({
      label: c.label,
      total: c.programs.length,
      atRisk: c.programs.filter((x) => ['at_risk', 'terlambat', 'overdue'].includes(x.tone)).length,
      onTrack: c.programs.filter((x) => x.tone === 'on_track').length,
    }))
    .filter((c) => c.total > 0)

  // ── Needs action ──────────────────────────────────────────────────────
  const role = scope.role
  const canApproveStatuses: string[] = []
  if (['KASUBDIV', 'ADMIN', 'SUPERADMIN'].includes(role)) canApproveStatuses.push('PENDING_KASUB')
  if (['KADIV', 'ADMIN', 'SUPERADMIN'].includes(role)) canApproveStatuses.push('PENDING_KADIV')

  const pendingApproval = programs
    .filter((p) => canApproveStatuses.includes(p.approvalStatus))
    .filter((p) => p.submittedById !== user.id && p.ownerId !== user.id)
    .map((p) => ({
      id: p.id, code: p.code, name: p.name,
      reason: p.approvalStatus === 'PENDING_KADIV' ? 'Menunggu persetujuan Kepala Divisi' : 'Menunggu persetujuan Kepala Sub Divisi',
      tag: 'approval' as const,
      divisi: (p.ownerUnitId != null ? unitById.get(p.ownerUnitId)?.code : null) ?? '-',
    }))

  const criticalBlockerRows = await prisma.blocker.findMany({
    where: {
      resolvedAt: null,
      severity: { in: ['CRITICAL', 'HIGH'] },
      ...(isExecutive ? {} : { createdByUnitId: { in: unitIds.length ? unitIds : [0] } }),
    },
    take: 20,
    select: {
      workItem: { select: { initiative: { select: { program: { select: { id: true, code: true, name: true, ownerUnitId: true } } } } } },
    },
  })
  const seenBlockerProg = new Set<number>()
  const criticalBlockers: Array<{ id: number; code: string; name: string; reason: string; tag: 'blocker'; divisi: string }> = []
  for (const b of criticalBlockerRows) {
    const prog = b.workItem?.initiative?.program
    if (!prog || seenBlockerProg.has(prog.id)) continue
    seenBlockerProg.add(prog.id)
    criticalBlockers.push({
      id: prog.id, code: prog.code, name: prog.name,
      reason: 'Critical blockers need escalation', tag: 'blocker',
      divisi: (prog.ownerUnitId != null ? unitById.get(prog.ownerUnitId)?.code : null) ?? '-',
    })
  }

  const needsSupport = classified
    .filter((p) => !!p.dukunganDibutuhkan && ['terlambat', 'overdue', 'at_risk'].includes(p.healthTone))
    .filter((p) => p.status !== 'COMPLETED')
    .map((p) => ({
      id: p.id, code: p.code, name: p.name,
      reason: p.dukunganDibutuhkan as string, tag: 'support' as const,
      divisi: (p.ownerUnitId != null ? unitById.get(p.ownerUnitId)?.code : null) ?? '-',
    }))

  const needsActionMerged = [...pendingApproval, ...criticalBlockers, ...needsSupport]
  const seenNeeds = new Set<number>()
  const needsAction = needsActionMerged.filter((n) => {
    if (seenNeeds.has(n.id)) return false
    seenNeeds.add(n.id)
    return true
  }).slice(0, 50)

  // ── Stagnation signal ─────────────────────────────────────────────────
  const sevenDaysAgo = new Date(now.getTime() - 7 * MS_DAY)
  const stagnantPrograms = programs
    .filter((p) => !['COMPLETED', 'CANCELLED'].includes(p.status))
    .filter((p) => p.approvalStatus === 'ACTIVE')
    .filter((p) => p.updatedAt && p.updatedAt.getTime() < sevenDaysAgo.getTime())
    .map((p) => ({
      id: p.id, code: p.code, name: p.name,
      daysIdle: diffDays(p.updatedAt, now),
      tone: classifyHealth(p, now),
      divisi: (p.ownerUnitId != null ? unitById.get(p.ownerUnitId)?.code : null) ?? '-',
    }))
    .sort((a, b) => b.daysIdle - a.daysIdle)

  // ── Blocker signal per division ───────────────────────────────────────
  const allBlockers = await prisma.blocker.findMany({
    where: {
      resolvedAt: null,
      createdByUnitId: { in: unitIds.length ? unitIds : [0] },
    },
    select: { severity: true, createdByUnitId: true },
  })
  const blockerSignal = units.map((unit) => {
    const divBlockers = allBlockers.filter((b) => b.createdByUnitId === unit.id)
    return {
      unitId: unit.id,
      code: unit.code,
      critical: divBlockers.filter((b) => b.severity === 'CRITICAL').length,
      high: divBlockers.filter((b) => b.severity === 'HIGH').length,
      medium: divBlockers.filter((b) => b.severity === 'MEDIUM').length,
      total: divBlockers.length,
    }
  })

  // ── KPI health snapshot ───────────────────────────────────────────────
  const programIds = programs.map((p) => p.id)
  const kpis = programIds.length
    ? await prisma.kpiDefinition.findMany({
      where: { actualValue: { not: null }, programId: { in: programIds } },
      select: {
        id: true, programId: true, actualValue: true, targetValue: true,
        warningThreshold: true, criticalThreshold: true,
        program: { select: { id: true, pilarStrategis: true, kelompok: true } },
      },
    })
    : []

  let kpiRed = 0, kpiYellow = 0, kpiGreen = 0
  const kpiByPilar: Record<string, { pilar: string; red: number; yellow: number; green: number; total: number }> = {}
  for (const kpi of kpis) {
    const actual = Number(kpi.actualValue)
    const target = Number(kpi.targetValue)
    const critical = kpi.criticalThreshold !== null ? Number(kpi.criticalThreshold) : target * 0.8
    const warning = kpi.warningThreshold !== null ? Number(kpi.warningThreshold) : target * 0.95
    let status: 'red' | 'yellow' | 'green'
    if (actual <= critical) { status = 'red'; kpiRed++ }
    else if (actual <= warning) { status = 'yellow'; kpiYellow++ }
    else { status = 'green'; kpiGreen++ }
    const pilar = kpi.program?.pilarStrategis ?? 'LAINNYA'
    if (!kpiByPilar[pilar]) kpiByPilar[pilar] = { pilar, red: 0, yellow: 0, green: 0, total: 0 }
    kpiByPilar[pilar][status]++
    kpiByPilar[pilar].total++
  }

  // ── Momentum ──────────────────────────────────────────────────────────
  const thirtyDaysAgo = new Date(now.getTime() - 30 * MS_DAY)
  const recentCompletedPrograms = programs.filter(
    (p) => p.status === 'COMPLETED' && p.updatedAt && p.updatedAt.getTime() >= thirtyDaysAgo.getTime()
  ).length
  const newProgramsThisMonth = programs.filter(
    (p) => p.createdAt && p.createdAt.getTime() >= thirtyDaysAgo.getTime()
  ).length

  const programOwnerUnitFilter = isExecutive
    ? {}
    : { initiative: { program: { ownerUnitId: { in: unitIds.length ? unitIds : [0] } } } }

  const tasksCompletedThisWeek = await prisma.workItem.count({
    where: {
      status: 'COMPLETED',
      actualCompletion: { gte: new Date(now.getTime() - 7 * MS_DAY) },
      ...programOwnerUnitFilter,
    },
  })

  // Weekly throughput — 8 ISO weeks (Monday-anchored), oldest→newest.
  const weekStart = startOfWeekMonday(now)
  const throughputFrom = new Date(weekStart.getTime() - 7 * 7 * MS_DAY)
  const completedTasks = await prisma.workItem.findMany({
    where: {
      status: 'COMPLETED',
      actualCompletion: { gte: throughputFrom },
      ...programOwnerUnitFilter,
    },
    select: { actualCompletion: true },
  })
  const weeklyThroughput: Array<{ weekStart: string; label: string; count: number }> = []
  for (let i = 7; i >= 0; i--) {
    const ws = new Date(weekStart.getTime() - i * 7 * MS_DAY)
    const wsEnd = new Date(ws.getTime() + 7 * MS_DAY)
    const count = completedTasks.filter(
      (t) => t.actualCompletion && t.actualCompletion.getTime() >= ws.getTime() && t.actualCompletion.getTime() < wsEnd.getTime()
    ).length
    weeklyThroughput.push({
      weekStart: ws.toISOString().slice(0, 10),
      label: `${ws.getDate()}/${ws.getMonth() + 1}`,
      count,
    })
  }

  const stagnantCount = stagnantPrograms.length
  const totalActive = programs.filter(
    (p) => p.approvalStatus === 'ACTIVE' && !['COMPLETED', 'CANCELLED'].includes(p.status)
  ).length
  const activeRate = totalActive > 0 ? Math.round(((totalActive - stagnantCount) / totalActive) * 100) : 100

  const momentum = {
    programsCompletedLast30d: recentCompletedPrograms,
    newProgramsLast30d: newProgramsThisMonth,
    tasksCompletedThisWeek,
    weeklyThroughput,
    stagnantCount,
    activeRate,
    stagnantPrograms,
  }

  // ── Velocity / trend (read snapshots if present) ─────────────────────
  const trendSeries = await buildTrendSeries(14)
  const velocity = await buildVelocity(overallCounts, byDivisi)

  // ── Programs for chart ────────────────────────────────────────────────
  const chartPrograms = classified.filter((p) => p.status !== 'COMPLETED' && p.status !== 'CANCELLED')
  const chartProgramIds = chartPrograms.map((p) => p.id)
  const taskCounts = chartProgramIds.length
    ? await prisma.workItem.findMany({
      where: { initiative: { programId: { in: chartProgramIds } }, status: { not: 'CANCELLED' } },
      select: { status: true, initiative: { select: { programId: true } } },
    })
    : []
  const taskCountByProgram = new Map<number, { total: number; done: number }>()
  for (const t of taskCounts) {
    const pid = t.initiative?.programId
    if (pid == null) continue
    const cur = taskCountByProgram.get(pid) ?? { total: 0, done: 0 }
    cur.total++
    if (['COMPLETED', 'IN_REVIEW'].includes(t.status)) cur.done++
    taskCountByProgram.set(pid, cur)
  }
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const fmtDmy = (d: Date) => `${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]} ${d.getFullYear()}`

  const programsForChart = chartPrograms.map((p) => {
    const startDate = p.startDate ?? null
    const endDate = p.targetEndDate ?? null
    const unit = p.ownerUnitId != null ? unitById.get(p.ownerUnitId) : null
    let timeElapsedPct: number | null = null
    if (startDate && endDate && endDate.getTime() > startDate.getTime()) {
      const totalDays = diffDays(startDate, endDate)
      const elapsedDays = now.getTime() > startDate.getTime()
        ? Math.min(diffDays(startDate, now), totalDays)
        : 0
      timeElapsedPct = totalDays > 0 ? Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100))) : null
    }
    const tc = taskCountByProgram.get(p.id)
    return {
      id: p.id, code: p.code, name: p.name,
      progressPercent: p.progressPercent,
      daysRemaining: endDate ? diffDays(now, endDate) : null,
      targetEndDate: endDate ? fmtDmy(endDate) : null,
      healthTone: p.healthTone,
      divisi: unit?.code ?? '-',
      timeElapsedPct,
      daysIdle: p.updatedAt ? diffDays(p.updatedAt, now) : null,
      ownerName: p.owner?.name ?? null,
      priority: p.priority ?? null,
      taskTotal: tc?.total ?? 0,
      taskDone: tc?.done ?? 0,
      progresTerkini: p.progresTerkini ?? null,
      dukunganDibutuhkan: p.dukunganDibutuhkan ?? null,
      approvalStatus: p.approvalStatus ?? null,
    }
  })

  // ── Control alerts ────────────────────────────────────────────────────
  const SEV_ORDER: Record<string, number> = { CRITICAL: 1, HIGH: 2, MEDIUM: 3, LOW: 4 }
  const controlRows = await prisma.blocker.findMany({
    where: {
      status: { in: ['OPEN', 'IN_PROGRESS'] },
      ...(isExecutive ? {} : { createdByUnitId: { in: unitIds.length ? unitIds : [0] } }),
    },
    take: 60,
    select: {
      id: true, code: true, title: true, status: true, severity: true,
      workItem: { select: { initiative: { select: { program: { select: { id: true, code: true, name: true } } } } } },
    },
  })
  const controls = controlRows
    .sort((a, b) => (SEV_ORDER[a.severity] ?? 5) - (SEV_ORDER[b.severity] ?? 5))
    .slice(0, 10)
    .map((b) => {
      const prog = b.workItem?.initiative?.program
      return {
        id: b.id, code: b.code, title: b.title, status: b.status, severity: b.severity,
        programId: prog?.id ?? null, programCode: prog?.code ?? null, programName: prog?.name ?? null,
      }
    })

  // ── Top blocker programs ──────────────────────────────────────────────
  const topBlockerRows = await prisma.blocker.findMany({
    where: {
      status: { in: ['OPEN', 'IN_PROGRESS'] },
      workItem: {
        initiative: {
          program: {
            archivedAt: null,
            ...(isExecutive ? {} : { ownerUnitId: { in: unitIds.length ? unitIds : [0] } }),
          },
        },
      },
    },
    select: {
      workItem: { select: { initiative: { select: { program: { select: { id: true, name: true, progressPercent: true, healthStatus: true } } } } } },
    },
  })
  const blockerCountByProgram = new Map<number, { program: { id: number; name: string; progressPercent: number; healthStatus: string | null }; count: number }>()
  for (const b of topBlockerRows) {
    const prog = b.workItem?.initiative?.program
    if (!prog) continue
    const cur = blockerCountByProgram.get(prog.id) ?? { program: prog, count: 0 }
    cur.count++
    blockerCountByProgram.set(prog.id, cur)
  }
  const topBlockerPrograms = [...blockerCountByProgram.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map(({ program, count }) => ({
      id: program.id, name: program.name,
      progressPercent: program.progressPercent ?? 0,
      blockerCount: count,
      healthStatus: program.healthStatus ?? 'YELLOW',
    }))

  // ── Checkpoints ───────────────────────────────────────────────────────
  const in30 = new Date(now.getTime() + 30 * MS_DAY)
  const checkpointRows = await prisma.workItem.findMany({
    where: {
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
      targetCompletion: { not: undefined, lte: in30 },
      ...programOwnerUnitFilter,
    },
    orderBy: [{ targetCompletion: 'asc' }],
    take: 30,
    select: { id: true, code: true, title: true, targetCompletion: true, status: true },
  })
  const checkpoints = checkpointRows
    .sort((a, b) => {
      const aOverdue = a.targetCompletion.getTime() < now.getTime() ? 0 : 1
      const bOverdue = b.targetCompletion.getTime() < now.getTime() ? 0 : 1
      if (aOverdue !== bOverdue) return aOverdue - bOverdue
      return a.targetCompletion.getTime() - b.targetCompletion.getTime()
    })
    .slice(0, 5)
    .map((t) => ({ id: t.id, code: t.code, title: t.title, targetCompletion: t.targetCompletion.toISOString(), status: t.status }))

  // ── KPI portfolio trend (pctGreen per date, last 14) ──────────────────
  const kpiDefsById = new Map(kpis.map((k) => [k.id, k]))
  const kpiIds = kpis.map((k) => k.id)
  let kpiTrend: Array<{ date: string; pctGreen: number }> = []
  if (kpiIds.length) {
    const sixtyDaysAgo = new Date(now.getTime() - 60 * MS_DAY)
    const kpiValues = await prisma.kpiValue.findMany({
      where: { kpiDefinitionId: { in: kpiIds }, measurementDate: { gte: sixtyDaysAgo } },
      orderBy: { measurementDate: 'asc' },
      select: { kpiDefinitionId: true, measurementDate: true, actualValue: true },
    })
    const byDate = new Map<string, typeof kpiValues>()
    for (const v of kpiValues) {
      const key = v.measurementDate.toISOString().slice(0, 10)
      const arr = byDate.get(key) ?? []
      arr.push(v)
      byDate.set(key, arr)
    }
    kpiTrend = [...byDate.entries()]
      .map(([date, vals]) => {
        let green = 0, total = 0
        for (const v of vals) {
          const def = kpiDefsById.get(v.kpiDefinitionId)
          if (!def) continue
          const actual = Number(v.actualValue)
          const warning = def.warningThreshold !== null ? Number(def.warningThreshold) : Number(def.targetValue) * 0.95
          if (actual > warning) green++
          total++
        }
        return { date, pctGreen: total > 0 ? Math.round((green / total) * 100) : 0 }
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 14)
  }

  // ── Recent activity (synthetic feed) ──────────────────────────────────
  const recentProgramActivity = programs
    .filter((p) => p.updatedAt && p.updatedAt.getTime() >= sevenDaysAgo.getTime())
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 5)
    .map((p) => ({
      id: p.id, entityType: 'PROGRAM', entityId: p.id,
      action: p.approvalStatus === 'PENDING_KASUB' || p.approvalStatus === 'PENDING_KADIV' ? 'CREATED' : 'STATUS_CHANGED',
      description: `${p.name} updated`,
      changeTimestamp: p.updatedAt.toISOString(),
    }))

  let recentKpiActivity: Array<{ id: number; entityType: string; entityId: number; action: string; description: string; changeTimestamp: string }> = []
  if (kpiIds.length) {
    const rows = await prisma.kpiValue.findMany({
      where: { kpiDefinitionId: { in: kpiIds }, createdAt: { gte: sevenDaysAgo } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, createdAt: true, kpiDefinition: { select: { name: true, programId: true } } },
    })
    recentKpiActivity = rows.map((v) => ({
      id: v.id, entityType: 'PROGRAM', entityId: v.kpiDefinition?.programId ?? 0,
      action: 'MEASURED', description: `${v.kpiDefinition?.name ?? 'KPI'} measured`,
      changeTimestamp: v.createdAt.toISOString(),
    }))
  }

  const recentBlockerRows = await prisma.blocker.findMany({
    where: {
      createdAt: { gte: sevenDaysAgo },
      ...(isExecutive ? {} : { createdByUnitId: { in: unitIds.length ? unitIds : [0] } }),
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, title: true, code: true, createdAt: true },
  })
  const recentBlockerActivity = recentBlockerRows.map((b) => ({
    id: b.id, entityType: 'TASK', entityId: b.id,
    action: 'BLOCKER_ADDED', description: b.title || (b.code ? `Blocker ${b.code}` : 'New blocker added'),
    changeTimestamp: b.createdAt.toISOString(),
  }))

  const recentActivity = [...recentProgramActivity, ...recentKpiActivity, ...recentBlockerActivity]
    .sort((a, b) => b.changeTimestamp.localeCompare(a.changeTimestamp))
    .slice(0, 5)

  return {
    scope: { role, level: scope.level, name: scope.name, unitCount: unitIds.length },
    summary: overallCounts,
    byDivisi,
    taskLoad: [],
    scorecardHealth,
    deadlineClusters,
    needsAction,
    stagnation: stagnantPrograms,
    blockerSignal,
    kpiHealth: { total: kpis.length, red: kpiRed, yellow: kpiYellow, green: kpiGreen, byPilar: Object.values(kpiByPilar), kpiTrend },
    momentum,
    velocity,
    trendSeries,
    programsForChart,
    controls,
    topBlockerPrograms,
    checkpoints,
    recentActivity,
  }
}

function startOfWeekMonday(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = date.getDay() // 0=Sun..6=Sat
  const delta = day === 0 ? -6 : 1 - day
  return new Date(date.getTime() + delta * MS_DAY)
}

async function buildTrendSeries(days: number) {
  const from = new Date(Date.now() - (days - 1) * MS_DAY)
  from.setHours(0, 0, 0, 0)
  const rows = await prisma.programHealthSnapshot.findMany({
    where: { snapshotDate: { gte: from } },
    orderBy: { snapshotDate: 'asc' },
    select: { snapshotDate: true, total: true, onTrack: true, atRisk: true, terlambat: true, overdue: true },
  })
  return rows.map((s) => {
    const tlm = s.terlambat + s.overdue
    const total = Math.max(1, s.total)
    return {
      date: s.snapshotDate.toISOString().slice(0, 10),
      total: s.total,
      onTrack: s.onTrack,
      atRisk: s.atRisk,
      terlambat: tlm,
      pctOnTrack: Math.round((s.onTrack / total) * 100),
    }
  })
}

async function buildVelocity(
  current: { total: number; onTrack: number; atRisk: number; terlambat: number; overdue: number; selesai: number },
  currentByDivisi: Array<Record<string, unknown>>,
) {
  const minTotal = Math.max(2, Math.floor((current.total ?? 0) * 0.5))
  const cutoff = new Date(Date.now() - 6 * MS_DAY)
  cutoff.setHours(0, 0, 0, 0)
  const previous = await prisma.programHealthSnapshot.findFirst({
    where: { snapshotDate: { lte: cutoff }, total: { gte: minTotal } },
    orderBy: { snapshotDate: 'desc' },
  })
  if (!previous) return null
  const prevDivisi = (previous.byDivisi as Array<{ unit?: { code?: string }; onTrack?: number; atRisk?: number }>) ?? []
  const divDelta = currentByDivisi.map((div) => {
    const unit = div.unit as { code: string }
    const prev = prevDivisi.find((p) => p.unit?.code === unit.code)
    return {
      code: unit.code,
      onTrack: ((div.onTrack as number) ?? 0) - (prev?.onTrack ?? 0),
      atRisk: ((div.atRisk as number) ?? 0) - (prev?.atRisk ?? 0),
    }
  })
  const daysAgo = Math.trunc((Date.now() - previous.snapshotDate.getTime()) / MS_DAY)
  return {
    comparedTo: previous.snapshotDate.toISOString().slice(0, 10),
    daysAgo,
    total: current.total - previous.total,
    onTrack: current.onTrack - previous.onTrack,
    atRisk: current.atRisk - previous.atRisk,
    terlambat: (current.terlambat - previous.terlambat) + (current.overdue - previous.overdue),
    selesai: current.selesai - previous.selesai,
    byDivisi: divDelta,
  }
}
