import 'server-only'
import { prisma } from '@/lib/db'
import { orgScopeForUser } from '@/lib/org-scope'
import type { AuthUser } from '@/lib/auth'

/* Port app/Http/Controllers/ExecutiveSummaryController.php + Services/KpiInsightService.php.
 * Komposisi: program status breakdown + perhatian khusus (DB) + KPI seed + leaderboard
 * (hardcoded, representatif — pending integrasi APMS) + insight auto-derived. */

export type InsightBullet = { kpi: string; realisasi: string; sasaran: string; ratio: number; satuan: string | null }
export type InsightPayload = { positif: InsightBullet[]; perhatian: InsightBullet[] }

export type StatusBreakdown = {
  total: number; onTrack: number; atRisk: number; terlambat: number; completed: number
  pctOnTrack: number; pctAtRisk: number; pctTerlambat: number; pctCompleted: number
}
export type PerhatianItem = {
  id: number; code: string; name: string; status: 'At Risk' | 'Delayed'
  deadline: string | null; daysLeft: number | null; dukungan: string | null; progress: string | null
}
export type DirektoratCard = { kode: string; nama: string; nilai: number; divisi: { kode: string; nama: string; nilai: number }[] }
export type Performer = { rank: number; nama: string; jabatan: string; unit: string; nilai: number }

export type ExecutiveSummaryData = {
  direktoratGrid: DirektoratCard[]
  trend: { periodes: { key: string; label: string }[]; series: { kode: string; nama: string; values: (number | null)[] }[] }
  programStatusBreakdown: StatusBreakdown
  perhatianKhusus: PerhatianItem[]
  insight: InsightPayload
  leaderboard: Record<string, Performer[]>
  periode: string
}

type ScopeUser = { id: number; roleType: string | null; unitId: number | null; directorateId: number | null }

/** Mirror computeProgramStatusBreakdown — map healthStatus/approvalStatus → charter vocab. */
async function computeProgramStatusBreakdown(user: ScopeUser): Promise<StatusBreakdown> {
  const scope = await orgScopeForUser(user)
  const programs = await prisma.program.findMany({
    where: {
      archivedAt: null,
      ...(!scope.isExecutive && scope.unitIds.length ? { ownerUnitId: { in: scope.unitIds } } : {}),
    },
    select: { healthStatus: true, approvalStatus: true },
  })

  let onTrack = 0, atRisk = 0, terlambat = 0, completed = 0
  for (const p of programs) {
    if (p.approvalStatus === 'COMPLETED') { completed++; continue }
    const s = p.healthStatus ?? 'GREEN'
    if (s === 'YELLOW') atRisk++
    else if (s === 'RED') terlambat++
    else onTrack++
  }
  const total = onTrack + atRisk + terlambat + completed
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)
  return {
    total, onTrack, atRisk, terlambat, completed,
    pctOnTrack: pct(onTrack), pctAtRisk: pct(atRisk), pctTerlambat: pct(terlambat), pctCompleted: pct(completed),
  }
}

/** Mirror computePerhatianKhusus — YELLOW/RED ACTIVE programs, RED first then targetEndDate. */
async function computePerhatianKhusus(user: ScopeUser, limit = 5): Promise<PerhatianItem[]> {
  const scope = await orgScopeForUser(user)
  const now = Date.now()
  const rows = await prisma.program.findMany({
    where: {
      archivedAt: null,
      approvalStatus: 'ACTIVE',
      healthStatus: { in: ['YELLOW', 'RED'] },
      ...(!scope.isExecutive && scope.unitIds.length ? { ownerUnitId: { in: scope.unitIds } } : {}),
    },
    select: { id: true, code: true, name: true, healthStatus: true, targetEndDate: true, dukunganDibutuhkan: true, progresTerkini: true },
  })
  rows.sort((a, b) => {
    const rank = (h: string | null) => (h === 'RED' ? 1 : h === 'YELLOW' ? 2 : 3)
    const r = rank(a.healthStatus) - rank(b.healthStatus)
    if (r !== 0) return r
    return a.targetEndDate.getTime() - b.targetEndDate.getTime()
  })
  return rows.slice(0, limit).map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    status: p.healthStatus === 'RED' ? 'Delayed' : 'At Risk',
    deadline: p.targetEndDate ? p.targetEndDate.toISOString().slice(0, 10) : null,
    daysLeft: p.targetEndDate ? Math.trunc((p.targetEndDate.getTime() - now) / 86_400_000) : null,
    dukungan: p.dukunganDibutuhkan,
    progress: p.progresTerkini,
  }))
}

/* ── KpiInsightService port ───────────────────────────────────────────────── */

const POSITIVE_THRESHOLD = 1.05
const ATTENTION_THRESHOLD = 0.95
const POSITIVE_LIMIT = 5
const ATTENTION_LIMIT = 3

/** Item insight bisa pakai string Indo ("3.257,8") atau number mentah (KPI direktur). */
export type InsightSeed = {
  nama: string; polaritas: 'maximize' | 'minimize'
  sasaran: string | number; realisasi: string | number; satuan: string
}
type KpiSeed = InsightSeed & { sasaran: string; realisasi: string }

/** Parse "3.257,8" / "1.483" / "100" / 95 → number (string = Indo format). */
function parseNumber(value: string | number | null): number | null {
  if (value === null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const clean = value.trim().replace(/\./g, '').replace(',', '.')
  const n = Number(clean)
  return Number.isFinite(n) ? n : null
}

function achievementRatio(sasaran: number, realisasi: number, polaritas: string): number | null {
  if (polaritas === 'minimize') {
    if (sasaran === 0) return realisasi === 0 ? 1.0 : 0.5
    if (realisasi === 0) return 1.5
    return sasaran / realisasi
  }
  if (sasaran === 0) return realisasi === 0 ? 1.0 : 1.5
  return realisasi / sasaran
}

export function deriveInsight(kpiItems: InsightSeed[]): InsightPayload {
  const positif: InsightBullet[] = []
  const perhatian: InsightBullet[] = []
  for (const item of kpiItems) {
    const sasaran = parseNumber(item.sasaran)
    const realisasi = parseNumber(item.realisasi)
    if (sasaran === null || realisasi === null) continue
    const ratio = achievementRatio(sasaran, realisasi, item.polaritas)
    if (ratio === null) continue
    const bullet: InsightBullet = { kpi: item.nama, realisasi: String(item.realisasi), sasaran: String(item.sasaran), ratio, satuan: item.satuan ?? null }
    if (ratio >= POSITIVE_THRESHOLD) positif.push(bullet)
    else if (ratio < ATTENTION_THRESHOLD) perhatian.push(bullet)
  }
  positif.sort((a, b) => b.ratio - a.ratio)
  perhatian.sort((a, b) => a.ratio - b.ratio)
  return { positif: positif.slice(0, POSITIVE_LIMIT), perhatian: perhatian.slice(0, ATTENTION_LIMIT) }
}

/* ── Hardcoded seeds (verbatim dari controller — representatif PDF DKMR) ────── */

const KPI_SEED: KpiSeed[] = [
  { nama: 'EBITDA', polaritas: 'maximize', sasaran: '1.483', realisasi: '3.257,8', satuan: 'Rp Miliar' },
  { nama: 'Net Operating Cash Flow (NOCF)', polaritas: 'maximize', sasaran: '1.534', realisasi: '3.305', satuan: 'Rp Miliar' },
  { nama: '% Debt To Equity Ratio', polaritas: 'minimize', sasaran: '60', realisasi: '44,39', satuan: '%' },
  { nama: 'Skor Aspek Kualitas MR', polaritas: 'maximize', sasaran: '81', realisasi: '90', satuan: 'Skor' },
  { nama: 'Minimum Cash Balance', polaritas: 'maximize', sasaran: '256', realisasi: '345', satuan: 'Rp Miliar' },
  { nama: '% On Time Risk Oversight & Evaluation', polaritas: 'maximize', sasaran: '96', realisasi: '100', satuan: '%' },
  { nama: 'Skor Aspek Kinerja', polaritas: 'maximize', sasaran: '80', realisasi: '77', satuan: 'Skor' },
  { nama: 'Skor Aspek Kualitas Penerapan MR', polaritas: 'maximize', sasaran: '81', realisasi: '78', satuan: 'Skor' },
  { nama: 'Denda Pajak', polaritas: 'minimize', sasaran: '0,7', realisasi: '0', satuan: 'Rp' },
  { nama: 'Jumlah Temuan Audit Keuangan Signifikan', polaritas: 'minimize', sasaran: '15', realisasi: '0', satuan: 'Jumlah' },
]

const LEADERBOARD_SEED: Record<string, Performer[]> = {
  'BOD-1': [
    { rank: 1, nama: 'Muhammad Muslim Utomo', jabatan: 'Kepala Divisi Keuangan Strategis dan Anggaran', unit: 'DKSA', nilai: 104.83 },
    { rank: 2, nama: 'Riza Pahlevi', jabatan: 'Kepala Divisi Pengadaan dan Umum', unit: 'DPDU', nilai: 102.60 },
    { rank: 3, nama: 'Prasetyo Mimboro', jabatan: 'Kepala Divisi Transformasi Digital', unit: 'DTDI', nilai: 102.19 },
  ],
  'BOD-2': [
    { rank: 1, nama: 'Dimas Aryo Wibisono', jabatan: 'Kepala Sub Divisi Anggaran', unit: 'DKSA', nilai: 105.00 },
    { rank: 2, nama: 'Deny Ariyanto Prabowo', jabatan: 'Kepala Sub Divisi HPS dan Informasi Harga', unit: 'DKSA', nilai: 105.00 },
    { rank: 3, nama: 'Raja Agustino M. Sembiring', jabatan: 'Kepala Sub Divisi Keuangan Strategis & Perencanaan Finansial', unit: 'DKSA', nilai: 104.83 },
  ],
  'BOD-3': [
    { rank: 1, nama: 'Daniel Hendri Saputra Siagian', jabatan: 'Asisten Financial Market', unit: 'DPPN', nilai: 105.76 },
    { rank: 2, nama: 'Yudi Santosa Suntara', jabatan: 'Asisten PSR & Plasma Tanaman', unit: 'DKSR', nilai: 105.06 },
    { rank: 3, nama: 'Irfan Herwindo Rachmawan', jabatan: 'Team Dedicated Office Komite Investasi', unit: 'DKSA', nilai: 105.00 },
  ],
}

export async function executiveSummary(user: AuthUser, periode?: string): Promise<ExecutiveSummaryData> {
  const scopeUser: ScopeUser = { id: user.id, roleType: user.roleType, unitId: user.unitId, directorateId: user.directorateId }
  const now = new Date()
  const resolvedPeriode = periode ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [programStatusBreakdown, perhatianKhusus] = await Promise.all([
    computeProgramStatusBreakdown(scopeUser),
    computePerhatianKhusus(scopeUser),
  ])

  return {
    // direktoratGrid + trend: scorecard direktorat (KPI riil pending APMS) — kosong
    // di live untuk scope ini; chart "0 directorates" tetap render frame-nya.
    direktoratGrid: [],
    trend: { periodes: [], series: [] },
    programStatusBreakdown,
    perhatianKhusus,
    insight: deriveInsight(KPI_SEED),
    leaderboard: LEADERBOARD_SEED,
    periode: resolvedPeriode,
  }
}
