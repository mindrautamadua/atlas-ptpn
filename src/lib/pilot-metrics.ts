import 'server-only'
import { prisma } from '@/lib/db'
import { THRESHOLD_DEFAULTS } from '@/lib/thresholds'

/* Port PilotMetricsController::computeMetrics — evaluasi pilot DKM (Sprint 4)
 * dari data EscalationRequest direktorat DKM. */

export type PilotMetrics = {
  directorate: { code: string; name: string } | null
  totalUsers: number
  totalEscalations: number
  avgDispositionDays: number | null
  hitRatePct: number | null
  activeUsersPct: number | null
  statusBreakdown: Record<string, number>
  computedAt: string
  note?: string
}
export type PilotCriteria = {
  avg_time_to_disposition_days?: number
  min_hit_rate_aggregate_pct?: number
  min_user_satisfaction_score?: number
  min_active_users_pct?: number
  evaluation_period_weeks?: number
}

function emptyMetrics(note: string): PilotMetrics {
  return {
    directorate: null, totalUsers: 0, totalEscalations: 0,
    avgDispositionDays: null, hitRatePct: null, activeUsersPct: null,
    statusBreakdown: {}, computedAt: new Date().toISOString(), note,
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10

export async function computePilotMetrics(): Promise<PilotMetrics> {
  // Direktorat DKM — DB pakai kode 'DIR-KMR' (php hardcode 'DKM'); resolve keduanya.
  const dkm = await prisma.directorate.findFirst({ where: { code: { in: ['DKM', 'DIR-KMR'] } }, select: { id: true, name: true } })
  if (!dkm) return emptyMetrics('The DKM directorate was not found.')

  const dkmUsers = await prisma.user.findMany({ where: { directorateId: dkm.id, isActive: true }, select: { id: true } })
  const ids = dkmUsers.map((u) => u.id)
  if (ids.length === 0) return emptyMetrics('No active users in the DKM directorate.')

  const DISPOSED = ['COMMITTED', 'IN_PROGRESS', 'CLEARED', 'DECLINED']

  // 1. Avg time-to-disposition
  const disposed = await prisma.escalationRequest.findMany({
    where: { requestedById: { in: ids }, status: { in: DISPOSED }, OR: [{ committedAt: { not: null } }, { resolvedAt: { not: null } }] },
    select: { requestedAt: true, committedAt: true, resolvedAt: true },
  })
  const dispositionDays = disposed
    .map((r) => { const end = r.committedAt ?? r.resolvedAt; return end ? Math.floor((end.getTime() - r.requestedAt.getTime()) / 86_400_000) : null })
    .filter((d): d is number => d != null)
  const avgDispositionDays = dispositionDays.length ? round1(dispositionDays.reduce((a, b) => a + b, 0) / dispositionDays.length) : null

  // 2. Hit rate (% CLEARED)
  const [totalEscalations, clearedCount] = await Promise.all([
    prisma.escalationRequest.count({ where: { requestedById: { in: ids } } }),
    prisma.escalationRequest.count({ where: { requestedById: { in: ids }, status: 'CLEARED' } }),
  ])
  const hitRatePct = totalEscalations > 0 ? round1((clearedCount / totalEscalations) * 100) : null

  // 3. Active users (created OR dispositioned)
  const [requesters, dispositioners] = await Promise.all([
    prisma.escalationRequest.findMany({ where: { requestedById: { in: ids } }, distinct: ['requestedById'], select: { requestedById: true } }),
    prisma.escalationRequest.findMany({ where: { escalatedToId: { in: ids }, status: { in: DISPOSED } }, distinct: ['escalatedToId'], select: { escalatedToId: true } }),
  ])
  const activeUserIds = new Set<number>([...requesters.map((r) => r.requestedById), ...dispositioners.map((d) => d.escalatedToId)])
  const activeUsersPct = round1((activeUserIds.size / ids.length) * 100)

  // 4. Status breakdown
  const grouped = await prisma.escalationRequest.groupBy({ by: ['status'], where: { requestedById: { in: ids } }, _count: { _all: true } })
  const statusBreakdown: Record<string, number> = {}
  for (const g of grouped) statusBreakdown[g.status] = g._count._all

  return {
    directorate: { code: 'DKM', name: dkm.name },
    totalUsers: ids.length,
    totalEscalations,
    avgDispositionDays,
    hitRatePct,
    activeUsersPct,
    statusBreakdown,
    computedAt: new Date().toISOString(),
  }
}

/** Criteria = config defaults + override SystemSetting (key 'pilot_dkm_success_criteria.*'). */
export async function pilotCriteria(): Promise<PilotCriteria> {
  const criteria: PilotCriteria = { ...(THRESHOLD_DEFAULTS.pilot_dkm_success_criteria as PilotCriteria) }
  const overrides = await prisma.systemSetting.findMany({ where: { key: { startsWith: 'pilot_dkm_success_criteria.' } }, select: { key: true, value: true } })
  for (const o of overrides) {
    const field = o.key.split('.')[1] as keyof PilotCriteria
    const num = typeof o.value === 'number' ? o.value : Number(o.value)
    if (Number.isFinite(num)) criteria[field] = num
  }
  return criteria
}
