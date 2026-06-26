/**
 * Activity / session helpers — port of WorkspaceController session math
 * (`sessionDurationMs`, `activityRange`, `dailyActivity`). Shared between the
 * two `/analytics/user-activity` route handlers.
 */

export type SessionLike = {
  startedAt: Date
  endedAt: Date | null
  durationMs: number
  lastPingAt: Date | null
}

/** Mirror WorkspaceController::sessionDurationMs — prefer persisted durationMs,
 *  else derive from started → (ended ?? lastPing ?? now). */
export function sessionDurationMs(s: SessionLike): number {
  if (s.durationMs > 0) return s.durationMs
  const start = s.startedAt ? s.startedAt.getTime() : Date.now()
  const end = s.endedAt
    ? s.endedAt.getTime()
    : s.lastPingAt
      ? s.lastPingAt.getTime()
      : Date.now()
  return Math.max(0, end - start)
}

/** Mirror WorkspaceController::activityRange — [from startOfDay, to endOfDay]. */
export function activityRange(range: string | null): { from: Date; to: Date } {
  const days = range === '30d' ? 30 : range === '90d' ? 90 : 7
  const to = new Date()
  to.setHours(23, 59, 59, 999)
  const from = new Date()
  from.setDate(from.getDate() - (days - 1))
  from.setHours(0, 0, 0, 0)
  return { from, to }
}

const ymd = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const dateString = ymd

/** Mirror WorkspaceController::dailyActivity — fill every day in [from, to]. */
export function dailyActivity(
  from: Date,
  to: Date,
  sessions: SessionLike[],
): Array<{ date: string; durationMs: number }> {
  const byDate = new Map<string, SessionLike[]>()
  for (const s of sessions) {
    const key = ymd(s.startedAt)
    const arr = byDate.get(key) ?? []
    arr.push(s)
    byDate.set(key, arr)
  }

  const days: Array<{ date: string; durationMs: number }> = []
  const cursor = new Date(from)
  while (cursor <= to) {
    const date = ymd(cursor)
    const arr = byDate.get(date) ?? []
    days.push({ date, durationMs: arr.reduce((sum, s) => sum + sessionDurationMs(s), 0) })
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}
