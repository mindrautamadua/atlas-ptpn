import 'server-only'
import { prisma } from '@/lib/db'
import { orgScopeForUser } from '@/lib/org-scope'
import { direktoratGrid, scorecardDefaultPeriode } from '@/lib/scorecard'
import { deriveInsight, type InsightPayload } from '@/lib/executive'
import type { AuthUser } from '@/lib/auth'

/* Port PerformanceController::{divisi,divisiComparison} + getDivisiKpi.
 * Division KPI: comparison (kartu per divisi) + single (detail tabel KPI). */

export type DivisiKpiItem = {
  no: number; kode: string; nama: string; perspektif: string
  bobot: number; satuan: string; polaritas: 'maximize' | 'minimize'
  sasaran: string; realisasi: string; skor: number; definisi: string | null
  rawTarget: number; rawRealisasi: number | null
}
export type PerspektifRow = { nama: string; bobot: number; pct: number | null }
export type DivisiCompare = {
  kode: string; nama: string; nilai: number; rank: number; totalDivisi: number
  kpiCount: number; onTarget: number; atRisk: number; perspektif: PerspektifRow[]
}
export type ExceptionRow = { divisi: string; kpi: string; pct: number; sasaran: string; realisasi: string; satuan: string; bobot: number }

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
const bareCode = (c: string) => c.replace('-HLD', '')

/** Port getDivisiKpi — map<bareCode, items[]> untuk seluruh KPI divisi tahun ini. */
async function divisiKpiItemsByCode(periode: string): Promise<Map<string, DivisiKpiItem[]>> {
  const [y, m] = periode.split('-').map(Number)
  const period = await prisma.performancePeriod.findFirst({ where: { tahun: y, bulan: m }, select: { id: true } })
  const periodId = period?.id ?? -1

  const items = await prisma.kpiDivisiItem.findMany({
    where: { tahun: y },
    orderBy: { urutan: 'asc' },
    select: {
      kode: true, nama: true, perspektif: true, satuan: true, polaritas: true, bobot: true,
      strategicObjective: true, urutan: true, unitId: true,
      values: { where: { periodId }, select: { target: true, realisasi: true, skor: true } },
    },
  })
  const unitIds = [...new Set(items.map((i) => i.unitId))]
  const units = unitIds.length === 0 ? [] : await prisma.organizationalUnit.findMany({ where: { id: { in: unitIds } }, select: { id: true, code: true } })
  const codeById = new Map(units.map((u) => [u.id, u.code]))

  const byBare = new Map<string, DivisiKpiItem[]>()
  for (const it of items) {
    const full = codeById.get(it.unitId)
    if (!full) continue
    const bare = bareCode(full)
    const bobotRaw = Number(it.bobot)
    const v = it.values[0]
    const skorRaw = v?.skor != null ? Number(v.skor) : null
    const rawTarget = v?.target != null ? Number(v.target) : 0
    const rawReal = v?.realisasi != null ? Number(v.realisasi) : null
    const item: DivisiKpiItem = {
      no: it.urutan, kode: it.kode, nama: it.nama, perspektif: normPerspektif(it.perspektif),
      bobot: Math.round(bobotRaw * 100 * 100) / 100,
      satuan: it.satuan ?? '',
      polaritas: it.polaritas === 'minimize' ? 'minimize' : 'maximize',
      sasaran: v?.target != null ? fmtNum(rawTarget) : '—',
      realisasi: rawReal === null ? '—' : fmtNum(rawReal),
      skor: skorRaw === null ? 0 : Math.round(bobotRaw * skorRaw * 10000) / 10000,
      definisi: it.strategicObjective,
      rawTarget, rawRealisasi: rawReal,
    }
    const arr = byBare.get(bare) ?? []
    arr.push(item)
    byBare.set(bare, arr)
  }
  return byBare
}

const PERSPEKTIF_ORDER = ['Financial', 'Customer', 'Internal Business Process', 'L&G']

/** Port divisiComparison — kartu per divisi (BOD fungsional). */
export async function divisiComparisonData(user: AuthUser, periode?: string) {
  const resolvedPeriode = periode ?? (await scorecardDefaultPeriode())
  const grid = await direktoratGrid(
    { id: user.id, roleType: user.roleType, unitId: user.unitId, directorateId: user.directorateId },
    resolvedPeriode,
  )
  const gridDir = grid.find((g) => g.kode === user.directorate?.code) ?? grid[0]
  if (!gridDir) {
    return {
      mode: 'comparison' as const,
      direktorat: { kode: user.directorate?.code ?? '—', nama: user.directorate?.name ?? 'Directorate not detected', nilai: 0 },
      divisiList: [] as DivisiCompare[], exceptions: [] as ExceptionRow[], periode: resolvedPeriode,
    }
  }

  const itemsByCode = await divisiKpiItemsByCode(resolvedPeriode)
  const sortedDivisi = [...gridDir.divisi].sort((a, b) => b.nilai - a.nilai)
  const divisiList: DivisiCompare[] = []
  const exceptions: ExceptionRow[] = []

  sortedDivisi.forEach((div, idx) => {
    const bare = bareCode(div.kode)
    const kpiItems = itemsByCode.get(bare) ?? []
    const perAgg: Record<string, { b: number; s: number }> = {}
    let onTarget = 0, atRisk = 0
    for (const k of kpiItems) {
      const pct = k.bobot > 0 ? (k.skor / k.bobot) * 100 : 0
      if (pct >= 100) onTarget++; else atRisk++
      if (pct < 100) {
        exceptions.push({ divisi: bare, kpi: k.nama, pct: Math.round(pct * 10) / 10, sasaran: k.sasaran, realisasi: k.realisasi, satuan: k.satuan, bobot: k.bobot })
      }
      perAgg[k.perspektif] = { b: (perAgg[k.perspektif]?.b ?? 0) + k.bobot, s: (perAgg[k.perspektif]?.s ?? 0) + k.skor }
    }
    const perspektif: PerspektifRow[] = Object.entries(perAgg)
      .sort(([a], [b]) => {
        const ia = PERSPEKTIF_ORDER.indexOf(a), ib = PERSPEKTIF_ORDER.indexOf(b)
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
      })
      .map(([nama, agg]) => ({ nama, bobot: Math.round(agg.b * 10) / 10, pct: agg.b > 0 ? Math.round((agg.s / agg.b) * 100 * 10) / 10 : null }))

    divisiList.push({
      kode: bare, nama: div.nama, nilai: div.nilai, rank: idx + 1, totalDivisi: sortedDivisi.length,
      kpiCount: kpiItems.length, onTarget, atRisk, perspektif,
    })
  })

  exceptions.sort((a, b) => a.pct - b.pct)
  return {
    mode: 'comparison' as const,
    direktorat: { kode: gridDir.kode, nama: gridDir.nama, nilai: gridDir.nilai },
    divisiList, exceptions, periode: resolvedPeriode,
  }
}

/** Port divisi() single mode — detail KPI satu divisi + peers + insight. */
export async function divisiSingleData(user: AuthUser, kode: string | undefined, periode?: string) {
  const resolvedPeriode = periode ?? (await scorecardDefaultPeriode())
  const grid = await direktoratGrid(
    { id: user.id, roleType: user.roleType, unitId: user.unitId, directorateId: user.directorateId },
    resolvedPeriode,
  )
  const requested = (kode ?? '').replace('-HLD', '').toUpperCase() || null

  // Cari divisi di grid scope user; default ke divisi pertama direktorat.
  let found: { dir: typeof grid[number]; div: typeof grid[number]['divisi'][number]; rank: number; total: number } | null = null
  for (const dir of grid) {
    const sorted = [...dir.divisi].sort((a, b) => b.nilai - a.nilai)
    const idx = sorted.findIndex((d) => bareCode(d.kode).toUpperCase() === requested)
    if (idx >= 0) { found = { dir, div: sorted[idx], rank: idx + 1, total: sorted.length }; break }
  }
  if (!found && grid.length > 0) {
    const dir = grid[0]; const sorted = [...dir.divisi].sort((a, b) => b.nilai - a.nilai)
    if (sorted.length > 0) found = { dir, div: sorted[0], rank: 1, total: sorted.length }
  }

  if (!found) {
    return {
      mode: 'single' as const,
      divisi: { kode: requested ?? '—', nama: 'Division not available', nilai: 0, rank: 0, totalDivisi: 0 },
      direktorat: { kode: '—', nama: 'No scorecard data yet', nilai: 0 },
      peers: [], kpiItems: [] as DivisiKpiItem[], topPerformers: [], insight: { positif: [], perhatian: [] } as InsightPayload, periode: resolvedPeriode,
    }
  }

  const bare = bareCode(found.div.kode)
  const itemsByCode = await divisiKpiItemsByCode(resolvedPeriode)
  const kpiItems = itemsByCode.get(bare) ?? []
  const sorted = [...found.dir.divisi].sort((a, b) => b.nilai - a.nilai)
  const peers = sorted.filter((d) => bareCode(d.kode) !== bare).map((d) => ({ kode: bareCode(d.kode), nama: d.nama, nilai: d.nilai }))

  const insight = deriveInsight(kpiItems.map((it) => ({
    nama: it.nama, polaritas: it.polaritas, satuan: it.satuan,
    sasaran: it.rawTarget, realisasi: it.rawRealisasi === null ? '—' : it.rawRealisasi,
  })))

  return {
    mode: 'single' as const,
    divisi: { kode: bare, nama: found.div.nama, nilai: found.div.nilai, rank: found.rank, totalDivisi: found.total },
    direktorat: { kode: found.dir.kode, nama: found.dir.nama, nilai: found.dir.nilai },
    peers, kpiItems, topPerformers: [] as Array<{ rank: number; nama: string; jabatan: string; nilai: number }>,
    insight, periode: resolvedPeriode,
  }
}

/** Apakah /performance/divisi (tanpa kode) harus redirect ke scorecard (DIRUT/eksekutif)? */
export async function divisiShouldRedirectToScorecard(user: AuthUser): Promise<boolean> {
  if ((user.roleType ?? '').toUpperCase() !== 'BOD') return false
  const scope = await orgScopeForUser({ id: user.id, roleType: user.roleType, unitId: user.unitId, directorateId: user.directorateId })
  return scope.isExecutive
}
