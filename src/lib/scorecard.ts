import 'server-only'
import { prisma } from '@/lib/db'
import { orgScopeForUser } from '@/lib/org-scope'

/**
 * Port of app/Services/ScorecardSummaryService.php::homeSnapshot() — the
 * `scorecardSnapshot` prop HomeView consumes (type ScorecardSnapshot).
 */

type ScoreUser = {
  id: number
  roleType: string | null
  unitId: number | null
  directorateId: number | null
}

const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MON_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function fmtYearMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function periodeLabelOf(periode: string): string {
  const [y, m] = periode.split('-').map(Number)
  return `${MON_FULL[(m ?? 1) - 1]} ${y}`
}
function subMonths(periode: string, n: number): string {
  const [y, m] = periode.split('-').map(Number)
  const d = new Date(y, (m - 1) - n, 1)
  return fmtYearMonth(d)
}

async function resolveLevel(user: ScoreUser): Promise<'portfolio' | 'directorate' | 'unit'> {
  const scope = await orgScopeForUser(user)
  if (scope.isExecutive) return 'portfolio'
  return scope.level
}

async function resolveScopedDirectorateIds(user: ScoreUser): Promise<number[] | null> {
  const scope = await orgScopeForUser(user)
  if (scope.isExecutive) return null
  if (scope.unitIds.length === 0) return []
  const units = await prisma.organizationalUnit.findMany({
    where: { id: { in: scope.unitIds }, directorateId: { not: null } },
    select: { directorateId: true },
  })
  return [...new Set(units.map((u) => u.directorateId).filter((x): x is number => x != null))]
}

export async function direktoratGrid(user: ScoreUser, periode: string) {
  const directorateIds = await resolveScopedDirectorateIds(user)
  const dirValues = await prisma.direktoratScorecard.findMany({
    where: { periode, ...(directorateIds !== null ? { directorateId: { in: directorateIds } } : {}) },
    select: { directorateId: true, nilai: true },
  })
  if (dirValues.length === 0) return []
  const valueByDir = new Map(dirValues.map((d) => [d.directorateId, Number(d.nilai)]))
  const ids = [...valueByDir.keys()]
  const [directorates, divisiValues] = await Promise.all([
    prisma.directorate.findMany({ where: { id: { in: ids } }, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true } }),
    prisma.divisiScorecard.findMany({
      where: { directorateId: { in: ids }, periode },
      select: { directorateId: true, nilai: true, unitId: true },
    }),
  ])
  // Resolve units by id separately — the DivisiScorecard→OrganizationalUnit
  // relation returns null in this dataset (cross-schema quirk, sama spt
  // user.directorate). Tanpa ini divisi terfilter habis → grid kosong.
  const unitById = await unitMapByIds(divisiValues.map((d) => d.unitId))
  return directorates.map((dir) => ({
    kode: dir.code,
    nama: dir.name,
    nilai: valueByDir.get(dir.id) ?? 0,
    divisi: divisiValues
      .filter((d) => d.directorateId === dir.id && unitById.has(d.unitId))
      .map((d) => { const u = unitById.get(d.unitId)!; return { kode: u.code, nama: u.name, nilai: Number(d.nilai) } }),
  }))
}

/** Map unitId → {code,name} (relasi unit langsung tak reliabel, lihat catatan). */
async function unitMapByIds(unitIds: Array<number | null>) {
  const ids = [...new Set(unitIds.filter((x): x is number => x != null))]
  if (ids.length === 0) return new Map<number, { code: string; name: string }>()
  const units = await prisma.organizationalUnit.findMany({
    where: { id: { in: ids } },
    select: { id: true, code: true, name: true },
  })
  return new Map(units.map((u) => [u.id, { code: u.code, name: u.name }]))
}

async function divisiGrid(directorateId: number, periode: string) {
  const values = await prisma.divisiScorecard.findMany({
    where: { directorateId, periode },
    select: { nilai: true, unitId: true },
  })
  const unitById = await unitMapByIds(values.map((d) => d.unitId))
  return values
    .filter((d) => unitById.has(d.unitId))
    .map((d) => { const u = unitById.get(d.unitId)!; return { kode: u.code, nama: u.name, nilai: Number(d.nilai) } })
}

async function latestPeriodeWithData(user: ScoreUser): Promise<string | null> {
  const now = fmtYearMonth(new Date())
  const level = await resolveLevel(user)
  let where: Record<string, unknown> = { periode: { lte: now } }
  if (level !== 'portfolio' && user.directorateId) {
    where = { ...where, directorateId: user.directorateId }
  } else {
    const ids = await resolveScopedDirectorateIds(user)
    if (ids !== null) where = { ...where, directorateId: { in: ids } }
  }
  const row = await prisma.direktoratScorecard.findFirst({
    where, orderBy: { periode: 'desc' }, select: { periode: true },
  })
  return row?.periode ?? null
}

async function kpiAvgSeries(user: ScoreUser, endPeriode: string, months: number) {
  months = Math.max(2, Math.min(12, months))
  const labels: Array<{ key: string; label: string }> = []
  for (let i = months - 1; i >= 0; i--) {
    const key = subMonths(endPeriode, i)
    labels.push({ key, label: MON_EN[Number(key.split('-')[1]) - 1] })
  }
  const keys = labels.map((l) => l.key)

  let rows: Array<{ periode: string; nilai: number }>
  const level = await resolveLevel(user)
  if (level !== 'portfolio' && user.directorateId) {
    const r = await prisma.direktoratScorecard.findMany({
      where: { directorateId: user.directorateId, periode: { in: keys } },
      select: { periode: true, nilai: true },
    })
    rows = r.map((x) => ({ periode: x.periode, nilai: Number(x.nilai) }))
  } else {
    const ids = await resolveScopedDirectorateIds(user)
    const r = await prisma.direktoratScorecard.findMany({
      where: { periode: { in: keys }, ...(ids !== null ? { directorateId: { in: ids } } : {}) },
      select: { periode: true, nilai: true },
    })
    rows = r.map((x) => ({ periode: x.periode, nilai: Number(x.nilai) }))
  }

  const byPeriode = new Map<string, number[]>()
  for (const r of rows) {
    const arr = byPeriode.get(r.periode) ?? []
    arr.push(r.nilai)
    byPeriode.set(r.periode, arr)
  }
  return labels.map(({ key, label }) => {
    const grp = byPeriode.get(key)
    const avg = grp && grp.length > 0 ? Math.round((grp.reduce((a, b) => a + b, 0) / grp.length) * 100) / 100 : null
    return { key, label, avg }
  })
}

async function resolveOwnItem(user: ScoreUser, periode: string) {
  if (!user.directorateId) return null
  const level = await resolveLevel(user)
  if (level === 'portfolio') return null
  const directorate = await prisma.directorate.findUnique({ where: { id: user.directorateId }, select: { code: true, name: true } })
  if (!directorate) return null
  const row = await prisma.direktoratScorecard.findFirst({
    where: { directorateId: user.directorateId, periode }, select: { nilai: true },
  })
  if (!row) return null
  return { kode: directorate.code, nama: directorate.name, nilai: Number(row.nilai) }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Scorecard PAGE (/performance/scorecard) — port PerformanceController::scorecard
 * + ScorecardSummaryService::{topDirektorat,trendDirektorat} + getDivisiKpi.
 * ═══════════════════════════════════════════════════════════════════════════ */

export type ScorecardRankItem = { rank: number; nama: string; kode?: string; sub?: string; nilai: number }
export type ScorecardMatrixRow = {
  kode: string; nama: string; nilai: number; direktorat: string
  perspektif: Record<string, number | null>; onTarget: number; kpiTotal: number
}
export type ScorecardExceptionRow = {
  divisi: string; kpi: string; pct: number; sasaran: string; realisasi: string; satuan: string; bobot: number
}
export type ScorecardTrend = {
  periodes: { key: string; label: string }[]
  series: { kode: string; nama: string; values: (number | null)[] }[]
}

/** Mirror fmtNum — number_format(v,2) lalu trim trailing zero/dot. */
function fmtNum(v: number | null): string {
  if (v === null) return '—'
  return v.toFixed(2).replace(/\.?0+$/, '')
}

function normPerspektif(p: string | null): string {
  switch ((p ?? '').toLowerCase().trim()) {
    case 'financial': case 'finansial': return 'Financial'
    case 'customer': return 'Customer'
    case 'ibp': case 'internal business process': return 'Internal Business Process'
    case 'l&g': case 'lng': case 'learning & growth': case 'learning and growth': return 'L&G'
    default: return (p ?? '').trim() || 'Lainnya'
  }
}

/** Default periode = max DirektoratScorecard.periode (fallback DivisiScorecard / now). */
export async function scorecardDefaultPeriode(): Promise<string> {
  return defaultPeriode()
}
async function defaultPeriode(): Promise<string> {
  const dir = await prisma.direktoratScorecard.aggregate({ _max: { periode: true } })
  if (dir._max.periode) return dir._max.periode
  const div = await prisma.divisiScorecard.aggregate({ _max: { periode: true } })
  return div._max.periode ?? fmtYearMonth(new Date())
}

/** Mirror ScorecardSummaryService::trendDirektorat — per-direktorat values aligned ke periodes. */
async function trendDirektorat(user: ScoreUser, months: number, endPeriode: string): Promise<ScorecardTrend> {
  months = Math.max(2, Math.min(12, months))
  const periodes: { key: string; label: string }[] = []
  for (let i = months - 1; i >= 0; i--) {
    const key = subMonths(endPeriode, i)
    periodes.push({ key, label: MON_EN[Number(key.split('-')[1]) - 1] })
  }
  const keys = periodes.map((p) => p.key)
  const directorateIds = await resolveScopedDirectorateIds(user)
  const rows = await prisma.direktoratScorecard.findMany({
    where: { periode: { in: keys }, ...(directorateIds !== null ? { directorateId: { in: directorateIds } } : {}) },
    select: { directorateId: true, periode: true, nilai: true },
  })
  if (rows.length === 0) return { periodes, series: [] }
  const dirIds = [...new Set(rows.map((r) => r.directorateId))]
  const directorates = await prisma.directorate.findMany({
    where: { id: { in: dirIds } }, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true },
  })
  const series = directorates.map((dir) => ({
    kode: dir.code,
    nama: dir.name,
    values: keys.map((key) => {
      const match = rows.find((r) => r.directorateId === dir.id && r.periode === key)
      return match ? Number(match.nilai) : null
    }),
  }))
  return { periodes, series }
}

/** Build matrix (BSC perspektif × divisi) + exceptions + kpiTotals dari KPI line-items. */
async function buildMatrix(
  grid: Array<{ kode: string; nama: string; nilai: number; divisi: Array<{ kode: string; nama: string; nilai: number }> }>,
  periode: string,
) {
  const [y, m] = periode.split('-').map(Number)
  const period = await prisma.performancePeriod.findFirst({ where: { tahun: y, bulan: m }, select: { id: true } })
  const periodId = period?.id ?? -1
  const divCodes = grid.flatMap((d) => d.divisi.map((div) => div.kode))

  // Resolve unitId ↔ code dulu (relasi KpiDivisiItem.unit tak reliabel — query
  // by unitId, bukan filter relasi `unit: { code }` yg bisa mengembalikan 0).
  const unitsForCodes = divCodes.length === 0 ? [] : await prisma.organizationalUnit.findMany({
    where: { code: { in: divCodes } },
    select: { id: true, code: true },
  })
  const codeByUnitId = new Map(unitsForCodes.map((u) => [u.id, u.code as string]))
  const unitIds = unitsForCodes.map((u) => u.id)

  const items = unitIds.length === 0 ? [] : await prisma.kpiDivisiItem.findMany({
    where: { tahun: y, unitId: { in: unitIds } },
    orderBy: { urutan: 'asc' },
    select: {
      kode: true, nama: true, perspektif: true, satuan: true, polaritas: true, bobot: true, unitId: true,
      values: { where: { periodId }, select: { target: true, realisasi: true, skor: true } },
    },
  })
  const byUnit = new Map<string, typeof items>()
  for (const it of items) {
    const code = codeByUnitId.get(it.unitId)
    if (!code) continue
    const arr = byUnit.get(code) ?? []
    arr.push(it)
    byUnit.set(code, arr)
  }

  const matrix: ScorecardMatrixRow[] = []
  const exceptions: ScorecardExceptionRow[] = []
  const kpiTotals = { total: 0, onTarget: 0 }

  for (const dir of grid) {
    for (const div of dir.divisi) {
      const divItems = byUnit.get(div.kode) ?? []
      const perAgg: Record<string, { b: number; s: number }> = {}
      let divOnTarget = 0
      for (const k of divItems) {
        const bobotRaw = Number(k.bobot)
        const v = k.values[0]
        const skorRaw = v?.skor != null ? Number(v.skor) : null
        const bobotDisplay = Math.round(bobotRaw * 100 * 100) / 100
        const weightedSkor = skorRaw === null ? 0 : Math.round(bobotRaw * skorRaw * 10000) / 10000
        const pct = bobotDisplay > 0 ? (weightedSkor / bobotDisplay) * 100 : 0
        kpiTotals.total++
        if (pct >= 100) { kpiTotals.onTarget++; divOnTarget++ }
        else {
          exceptions.push({
            divisi: div.kode, kpi: k.nama, pct: Math.round(pct * 10) / 10,
            sasaran: fmtNum(v?.target != null ? Number(v.target) : null),
            realisasi: v?.realisasi == null ? '—' : fmtNum(Number(v.realisasi)),
            satuan: k.satuan ?? '', bobot: bobotDisplay,
          })
        }
        const p = normPerspektif(k.perspektif)
        perAgg[p] = { b: (perAgg[p]?.b ?? 0) + bobotDisplay, s: (perAgg[p]?.s ?? 0) + weightedSkor }
      }
      const cells: Record<string, number | null> = {}
      for (const [p, agg] of Object.entries(perAgg)) {
        cells[p] = agg.b > 0 ? Math.round((agg.s / agg.b) * 100 * 10) / 10 : null
      }
      matrix.push({
        kode: div.kode, nama: div.nama, nilai: div.nilai, direktorat: dir.kode,
        perspektif: cells, onTarget: divOnTarget, kpiTotal: divItems.length,
      })
    }
  }
  exceptions.sort((a, b) => a.pct - b.pct)
  return { matrix, exceptions, kpiTotals }
}

export async function scorecardPageData(user: ScoreUser, periode?: string) {
  const resolvedPeriode = periode ?? (await defaultPeriode())
  const grid = await direktoratGrid(user, resolvedPeriode)

  const sortedDir = [...grid].sort((a, b) => b.nilai - a.nilai)
  const topDirektorat: ScorecardRankItem[] = sortedDir.slice(0, 3).map((d, i) => ({
    rank: i + 1, nama: d.nama, kode: d.kode, nilai: d.nilai,
  }))

  const allDivisi = grid.flatMap((dir) => dir.divisi.map((div) => ({
    kode: div.kode,
    sub: /^divisi\s/i.test(div.nama) ? div.nama : `Divisi ${div.nama}`,
    nilai: div.nilai,
  }))).sort((a, b) => b.nilai - a.nilai)
  const topDivisi: ScorecardRankItem[] = allDivisi.slice(0, 3).map((d, i) => ({
    rank: i + 1, nama: d.kode, sub: d.sub, nilai: d.nilai,
  }))

  const [trend, matrixData] = await Promise.all([
    trendDirektorat(user, 6, resolvedPeriode),
    buildMatrix(grid, resolvedPeriode),
  ])

  return {
    topDirektorat,
    topDivisi,
    direktoratGrid: grid,
    trend,
    periode: resolvedPeriode,
    matrix: matrixData.matrix,
    exceptions: matrixData.exceptions,
    kpiTotals: matrixData.kpiTotals,
  }
}

export async function homeScorecardSnapshot(user: ScoreUser, periode?: string) {
  const resolvedPeriode = periode ?? (await latestPeriodeWithData(user)) ?? fmtYearMonth(new Date())
  const level = await resolveLevel(user)
  const ownItem = await resolveOwnItem(user, resolvedPeriode)

  let items: Array<{ kode: string; nama: string; nilai: number; divisi?: Array<{ kode: string; nama: string; nilai: number }> }> = []
  let grid: Array<{ kode: string; nama: string; nilai: number; divisi: Array<{ kode: string; nama: string; nilai: number }> }> | null = null
  let itemLabel = 'item'
  if (level === 'portfolio') {
    grid = await direktoratGrid(user, resolvedPeriode)
    items = grid
    itemLabel = 'direktorat'
  } else if (level === 'directorate' && user.directorateId) {
    items = await divisiGrid(user.directorateId, resolvedPeriode)
    itemLabel = 'divisi'
  }

  const avgItem = items.length > 0
    ? Math.round((items.reduce((a, b) => a + b.nilai, 0) / items.length) * 100) / 100
    : 0

  const sorted = [...items].sort((a, b) => b.nilai - a.nilai)
  const topItems = sorted.slice(0, 3).map((d, i) => ({ rank: i + 1, nama: d.nama, kode: d.kode, nilai: d.nilai }))
  const belowTarget = sorted.filter((d) => d.nilai < 80).map((d) => ({ nama: d.nama, kode: d.kode, nilai: d.nilai }))

  const series = await kpiAvgSeries(user, resolvedPeriode, 6)
  const kpiTrend = series.map((s) => ({ label: s.label, avg: s.avg }))
  const nonNull = series.filter((s) => s.avg !== null) as Array<{ avg: number }>
  const avgDelta = nonNull.length >= 2
    ? Math.round((nonNull[nonNull.length - 1].avg - nonNull[nonNull.length - 2].avg) * 100) / 100
    : null

  const payload: Record<string, unknown> = {
    level,
    periode: resolvedPeriode,
    periodeLabel: periodeLabelOf(resolvedPeriode),
    itemLabel,
    avgItem,
    avgDelta,
    totalItem: items.length,
    topItems,
    belowTarget,
    ownItem,
    kpiTrend,
  }
  if (grid !== null) payload.grid = grid
  return payload
}
