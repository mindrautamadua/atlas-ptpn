import 'server-only'
import { prisma } from '@/lib/db'

/* Port AdminThresholdsController (getSchema + config/atlas-thresholds.php) +
 * ThresholdService. Superadmin dynamic config disimpan di SystemSetting. */

export type FieldDef = { label: string; type: 'int' | 'float' | 'string'; unit?: string }
export type CategorySection = { category: string; title: string; helper: string; fields: Record<string, FieldDef> }
export type OverrideRow = { key: string; value: unknown; category: string; description?: string | null; updatedAt: string }

export const THRESHOLD_SCHEMA: CategorySection[] = [
  {
    category: 'escalation_aging', title: 'Escalation Aging',
    helper: 'How many days of waiting before the visual indicator changes color. Not a disposition deadline — only an aging signal.',
    fields: {
      'escalation_aging.yellow_after_days': { label: 'Turns yellow after', type: 'int', unit: 'days' },
      'escalation_aging.orange_after_days': { label: 'Turns orange after', type: 'int', unit: 'days' },
      'escalation_aging.red_after_days': { label: 'Turns red after', type: 'int', unit: 'days' },
    },
  },
  {
    category: 'carryover', title: 'Action Item Carryover',
    helper: 'How many times a meeting action item may "carry over" before the system nudges or auto-escalates.',
    fields: {
      'carryover.nudge_threshold': { label: 'Soft nudge (prompt: what is stuck?)', type: 'int', unit: 'times' },
      'carryover.auto_clearpath_threshold': { label: 'Auto-suggest Clear the Path', type: 'int', unit: 'times' },
      'carryover.force_disposition_threshold': { label: 'Force supervisor disposition', type: 'int', unit: 'times' },
    },
  },
  {
    category: 'progress_log', title: 'Progress Log Freshness', helper: 'Cadence for program progress reporting.',
    fields: { 'progress_log.stale_after_days': { label: 'Stale after', type: 'int', unit: 'days' } },
  },
  {
    category: 'auto_health', title: 'Auto-Health Derivation',
    helper: 'Thresholds for deriving program health (RED/YELLOW) from actual signals.',
    fields: {
      'auto_health.red_overdue_ratio': { label: '% tasks overdue → RED', type: 'float', unit: '0–1' },
      'auto_health.yellow_overdue_ratio': { label: '% tasks overdue → YELLOW', type: 'float', unit: '0–1' },
      'auto_health.red_blocker_count': { label: 'Open blocker count → RED', type: 'int', unit: 'count' },
      'auto_health.yellow_blocker_count': { label: 'Open blocker count → YELLOW', type: 'int', unit: 'count' },
      'auto_health.red_kpi_deviation': { label: '% KPI deviation → RED', type: 'int', unit: '%' },
      'auto_health.yellow_kpi_deviation': { label: '% KPI deviation → YELLOW', type: 'int', unit: '%' },
      'auto_health.discrepancy_level_threshold': { label: 'Discrepancy level threshold', type: 'int', unit: 'levels' },
    },
  },
  {
    category: 'commitment_ledger', title: 'Commitment Ledger', helper: 'Settings for the "My Commitments" page.',
    fields: {
      'commitment_ledger.lookback_weeks': { label: 'Lookback period', type: 'int', unit: 'weeks' },
      'commitment_ledger.streak_min_hit_rate_pct': { label: 'Min hit rate for a streak', type: 'int', unit: '%' },
      'commitment_ledger.low_consistency_alert_pct': { label: 'Alert supervisor if hit rate ≤', type: 'int', unit: '%' },
      'commitment_ledger.low_consistency_alert_weeks': { label: 'For how many weeks', type: 'int', unit: 'weeks' },
    },
  },
  {
    category: 'pilot_dkm_success_criteria', title: 'Pilot DKM Success Criteria',
    helper: 'Target metrics for evaluating the Sprint 4 pilot in the DKM directorate.',
    fields: {
      'pilot_dkm_success_criteria.avg_time_to_disposition_days': { label: 'Avg time to disposition', type: 'int', unit: 'days' },
      'pilot_dkm_success_criteria.min_hit_rate_aggregate_pct': { label: 'Min hit rate aggregate', type: 'int', unit: '%' },
      'pilot_dkm_success_criteria.min_user_satisfaction_score': { label: 'Min user satisfaction', type: 'int', unit: '1–10' },
      'pilot_dkm_success_criteria.min_active_users_pct': { label: 'Min active users', type: 'int', unit: '%' },
      'pilot_dkm_success_criteria.evaluation_period_weeks': { label: 'Evaluation period', type: 'int', unit: 'weeks' },
    },
  },
  {
    category: 'monthly_report', title: 'Monthly Report', helper: 'Anti-ABS signal for reviewers.',
    fields: {
      'monthly_report.suspicious_clean_min_kendala': { label: 'Min blockers to be considered normal', type: 'int', unit: 'count' },
      'monthly_report.suspicious_lookback_periods': { label: 'Historical lookback', type: 'int', unit: 'months' },
    },
  },
  {
    category: 'inbox_today', title: 'Inbox Today', helper: 'Cache TTL untuk endpoint /inbox/today.',
    fields: { 'inbox_today.cache_ttl_seconds': { label: 'Cache TTL', type: 'int', unit: 'seconds' } },
  },
]

export const THRESHOLD_DEFAULTS: Record<string, Record<string, unknown>> = {
  escalation_aging: { yellow_after_days: 3, orange_after_days: 7, red_after_days: 14 },
  carryover: { nudge_threshold: 2, auto_clearpath_threshold: 3, force_disposition_threshold: 4 },
  progress_log: { stale_after_days: 7 },
  auto_health: {
    discrepancy_level_threshold: 1, grace_period_days: 7,
    red_overdue_ratio: 0.30, red_blocker_count: 3, red_kpi_deviation: 25,
    yellow_overdue_ratio: 0.10, yellow_blocker_count: 1, yellow_kpi_deviation: 10,
  },
  monthly_report: { suspicious_clean_min_kendala: 2, suspicious_lookback_periods: 3 },
  pilot_dkm_success_criteria: {
    avg_time_to_disposition_days: 5, min_hit_rate_aggregate_pct: 60,
    min_user_satisfaction_score: 7, min_active_users_pct: 70, evaluation_period_weeks: 6,
  },
  commitment_ledger: { lookback_weeks: 12, streak_min_hit_rate_pct: 80, low_consistency_alert_pct: 60, low_consistency_alert_weeks: 4 },
  inbox_today: { cache_ttl_seconds: 60 },
}

/** Semua key valid (untuk validasi write — cegah arbitrary key). */
export function validThresholdKeys(): Set<string> {
  return new Set(THRESHOLD_SCHEMA.flatMap((c) => Object.keys(c.fields)))
}

export async function thresholdsData() {
  const rows = await prisma.systemSetting.findMany({ select: { key: true, value: true, category: true, description: true, updatedAt: true } })
  const overrides: Record<string, OverrideRow> = {}
  for (const r of rows) {
    overrides[r.key] = { key: r.key, value: r.value, category: r.category, description: r.description, updatedAt: r.updatedAt.toISOString() }
  }
  return { schema: THRESHOLD_SCHEMA, defaults: THRESHOLD_DEFAULTS, overrides }
}

export async function setThreshold(key: string, value: unknown, category: string, userId: number, description: string | null): Promise<OverrideRow> {
  const row = await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value: value as never, category, description, updatedById: userId },
    update: { value: value as never, category, description, updatedById: userId },
    select: { key: true, value: true, category: true, description: true, updatedAt: true },
  })
  return { key: row.key, value: row.value, category: row.category, description: row.description, updatedAt: row.updatedAt.toISOString() }
}

export async function resetThreshold(key: string): Promise<void> {
  await prisma.systemSetting.deleteMany({ where: { key } })
}
