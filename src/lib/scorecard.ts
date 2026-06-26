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

async function direktoratGrid(user: ScoreUser, periode: string) {
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
      select: { directorateId: true, nilai: true, unit: { select: { code: true, name: true } } },
    }),
  ])
  return directorates.map((dir) => ({
    kode: dir.code,
    nama: dir.name,
    nilai: valueByDir.get(dir.id) ?? 0,
    divisi: divisiValues
      .filter((d) => d.directorateId === dir.id && d.unit !== null)
      .map((d) => ({ kode: d.unit!.code, nama: d.unit!.name, nilai: Number(d.nilai) })),
  }))
}

async function divisiGrid(directorateId: number, periode: string) {
  const values = await prisma.divisiScorecard.findMany({
    where: { directorateId, periode },
    select: { nilai: true, unit: { select: { code: true, name: true } } },
  })
  return values
    .filter((d) => d.unit !== null)
    .map((d) => ({ kode: d.unit!.code, nama: d.unit!.name, nilai: Number(d.nilai) }))
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
