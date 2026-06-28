import 'server-only'
import { prisma } from '@/lib/db'
import type { Performer } from '@/lib/executive'

/* Port PerformanceController::individu — Leaderboard (KPI Individual).
 * Leaderboard kosong sampai sumber KPI individual (APMS) tersedia; halaman
 * utamanya org-navigation per divisi. */

export type OrgGroup = { kode: string; nama: string; divisi: { kode: string; nama: string }[] }

export async function individuData(periode?: string): Promise<{
  topPerformers: Record<string, Performer[]>
  orgNav: OrgGroup[]
  periode: string
}> {
  const resolvedPeriode = periode ?? '2026-03'

  const directorates = await prisma.directorate.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true },
  })
  const dirIds = directorates.map((d) => d.id)
  const units = dirIds.length === 0 ? [] : await prisma.organizationalUnit.findMany({
    where: { unitType: 'DIVISI', isActive: true, directorateId: { in: dirIds } },
    orderBy: { code: 'asc' },
    select: { code: true, name: true, directorateId: true },
  })

  const orgNav: OrgGroup[] = directorates
    .map((dir) => ({
      kode: dir.code,
      nama: dir.name,
      divisi: units.filter((u) => u.directorateId === dir.id).map((u) => ({ kode: u.code, nama: u.name })),
    }))
    .filter((d) => d.divisi.length > 0)

  // Leaderboard individual kosong (belum ada sumber KPI individual).
  return { topPerformers: {}, orgNav, periode: resolvedPeriode }
}

/* ── Individual detail (My KPI) — port individuDetail() ─────────────────── */

export type Karyawan = { id: string; nama: string; jabatan: string; unit: string; nilai: number; jumlah_kpi: number }

export async function individuDetailData(id: string, periode?: string) {
  const resolvedPeriode = periode ?? '2026-03'
  const numId = Number(id)
  const user = Number.isInteger(numId)
    ? await prisma.user.findUnique({ where: { id: numId }, select: { id: true, name: true, positionTitle: true, unitId: true } })
    : null

  let unitCode = '—'
  if (user?.unitId) {
    const unit = await prisma.organizationalUnit.findUnique({ where: { id: user.unitId }, select: { code: true } })
    unitCode = unit?.code ?? '—'
  }

  const karyawan: Karyawan = user
    ? { id: String(user.id), nama: user.name, jabatan: user.positionTitle ?? '—', unit: unitCode, nilai: 0, jumlah_kpi: 0 }
    : { id, nama: 'Employee not found', jabatan: '—', unit: '—', nilai: 0, jumlah_kpi: 0 }

  // KPI items kosong sampai modul KPI individual aktif.
  return { karyawan, kpiItems: [] as unknown[], periode: resolvedPeriode }
}

/* ── Commitment ledger — port commitmentLedger() ───────────────────────── */

export type LedgerWeek = { weekKey: string; weekStart: string; total: number; hits: number; misses: number; hitRate: number | null }
export type LedgerData = { userId: number; lookbackWeeks: number; weeks: LedgerWeek[]; hitRateAggregate: number | null; streak: number; streakMinPct: number }

function startOfWeekMon(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const day = (x.getDay() + 6) % 7 // Monday = 0
  x.setDate(x.getDate() - day)
  return x
}
function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dayNum + 3) // nearest Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export async function commitmentLedger(userId: number): Promise<LedgerData> {
  const lookbackWeeks = 12
  const streakMin = 80
  const thisMon = startOfWeekMon(new Date())
  const startDate = new Date(thisMon)
  startDate.setDate(startDate.getDate() - lookbackWeeks * 7)

  const [tasks, actionItems, assignments] = await Promise.all([
    prisma.workItem.findMany({ where: { assignedTo: userId, targetCompletion: { gte: startDate } }, select: { targetCompletion: true, status: true } }),
    prisma.meetingActionItem.findMany({ where: { assignedToId: userId, dueDate: { gte: startDate } }, select: { dueDate: true, status: true } }),
    prisma.assignment.findMany({ where: { assigneeId: userId, dueDate: { gte: startDate } }, select: { dueDate: true, status: true } }),
  ])

  const weeks: LedgerWeek[] = []
  for (let i = lookbackWeeks - 1; i >= 0; i--) {
    const weekStart = new Date(thisMon)
    weekStart.setDate(weekStart.getDate() - i * 7)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)
    const inWeek = (d: Date | null) => d != null && d >= weekStart && d < weekEnd

    let total = 0, hits = 0
    for (const t of tasks) {
      if (inWeek(t.targetCompletion)) { total++; if (t.status === 'COMPLETED' || t.status === 'DONE') hits++ }
    }
    for (const a of actionItems) {
      if (inWeek(a.dueDate)) { total++; if (a.status === 'COMPLETED') hits++ }
    }
    for (const a of assignments) {
      if (inWeek(a.dueDate)) { total++; if (a.status === 'SELESAI' || a.status === 'COMPLETED') hits++ }
    }
    weeks.push({
      weekKey: isoWeekKey(weekStart),
      weekStart: weekStart.toISOString().slice(0, 10),
      total, hits, misses: total - hits,
      hitRate: total > 0 ? Math.round((hits / total) * 100 * 10) / 10 : null,
    })
  }

  const totalAll = weeks.reduce((s, w) => s + w.total, 0)
  const hitsAll = weeks.reduce((s, w) => s + w.hits, 0)
  const hitRateAggregate = totalAll > 0 ? Math.round((hitsAll / totalAll) * 100 * 10) / 10 : null

  let streak = 0
  for (const w of [...weeks].reverse()) {
    if (w.hitRate !== null && w.hitRate >= streakMin) streak++
    else break
  }

  return { userId, lookbackWeeks, weeks, hitRateAggregate, streak, streakMinPct: streakMin }
}
