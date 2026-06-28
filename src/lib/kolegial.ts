import 'server-only'
import { prisma } from '@/lib/db'
import { orgScopeForUser } from '@/lib/org-scope'
import { direktoratGrid, scorecardDefaultPeriode } from '@/lib/scorecard'
import { deriveInsight, type InsightPayload } from '@/lib/executive'
import type { AuthUser } from '@/lib/auth'

/* Port PerformanceController::{kolegial,kolegialDetail} + direkturList +
 * getDirekturKpiGroups (KPI Kolegial / Directorate KPI). */

export type KpiItem = {
  kode: string; nama: string; satuan: string; polaritas: 'maximize' | 'minimize'
  bobot: number; target: number; realisasi: number; skor: number
}
export type KpiGroup = {
  perspektif: string; perspektif_key: string
  color: 'green' | 'yellow' | 'red'; pct: number; items: KpiItem[]
}
export type Direktur = { kode: string; nama: string; jabatan: string; slug: string }
export type DirekturCard = Direktur & { nilai: number; total_kpi: number; perspektif?: string[] }
export type StatItem = { label: string; value: string; sub?: string; color: 'muted' | 'green' | 'yellow' | 'red' }

const DIREKTUR_LIST: Record<string, Direktur> = {
  DIRUT: { kode: 'DIRUT', nama: 'Denaldy Mulino Mauna', jabatan: 'Direktur Utama', slug: 'dirut' },
  DBS:   { kode: 'DBS', nama: 'Ryanto Wisnuardhy', jabatan: 'Direktur Bisnis', slug: 'dbs' },
  DAS:   { kode: 'DAS', nama: 'Agung Setya Imam Effendi', jabatan: 'Direktur Aset', slug: 'das' },
  DPP:   { kode: 'DPP', nama: 'Rizal H. Damanik', jabatan: 'Direktur Produksi & Pengembangan', slug: 'dpp' },
  DSU:   { kode: 'DSU', nama: 'Endang Suraningsih', jabatan: 'Direktur SDM & Umum', slug: 'dsu' },
  DKM:   { kode: 'DKM', nama: 'M. Iswahyudi', jabatan: 'Direktur Keuangan & Manajemen Risiko', slug: 'dkm' },
}

const CODE_ALIAS: Record<string, string> = { 'DIR-KMR': 'DKM' }
const TOTAL_KPI_BY_CODE: Record<string, number> = { DIRUT: 12, DBS: 10, DAS: 10, DPP: 18, DSU: 10, DKM: 19 }
const PERSPEKTIF_BY_CODE: Record<string, string[]> = {
  DIRUT: ['Ekonomi & Sosial', 'IMB', 'Teknologi', 'Investasi', 'Talenta'],
  DKM: ['Kinerja Keuangan', 'Tata Kelola & Risiko', 'Kepatuhan & Pajak'],
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

/** Mirror getDirekturKpiGroups — KPI items per perspektif BSC + agregat skor. */
export async function getDirekturKpiGroups(directorCode: string, periode: string): Promise<KpiGroup[]> {
  // alias DKM → DIR-KMR untuk match directorate_code di DB
  const dbCode = directorCode.toUpperCase() === 'DKM' ? 'DIR-KMR' : directorCode.toUpperCase()
  const [y, m] = periode.split('-').map(Number)
  const period = await prisma.performancePeriod.findFirst({ where: { tahun: y, bulan: m }, select: { id: true } })
  const periodId = period?.id ?? -1

  const rows = await prisma.kpiDirekturItem.findMany({
    where: { directorateCode: dbCode },
    orderBy: { id: 'asc' },
    select: {
      kode: true, nama: true, perspektif: true, satuan: true, polaritas: true, bobot: true,
      values: { where: { periodId }, select: { target: true, realisasi: true, skor: true } },
    },
  })
  if (rows.length === 0) return []

  const keyOf = (p: string): string =>
    p === 'Financial' ? 'financial'
    : p === 'Customer' ? 'customer'
    : p === 'Internal Business Process' ? 'ibp'
    : p === 'L&G' ? 'lng' : 'lainnya'
  const order = ['financial', 'customer', 'ibp', 'lng', 'lainnya']

  const groups = new Map<string, { perspektif: string; perspektif_key: string; items: KpiItem[] }>()
  for (const r of rows) {
    const perspektif = normPerspektif(r.perspektif)
    const key = keyOf(perspektif)
    const bobotRaw = Number(r.bobot)
    const v = r.values[0]
    const skorRaw = v?.skor != null ? Number(v.skor) : null
    const item: KpiItem = {
      kode: r.kode, nama: r.nama, satuan: r.satuan ?? '',
      polaritas: r.polaritas === 'minimize' ? 'minimize' : 'maximize',
      bobot: Math.round(bobotRaw * 100 * 100) / 100,
      target: v?.target != null ? Number(v.target) : 0,
      realisasi: v?.realisasi != null ? Number(v.realisasi) : 0,
      skor: skorRaw === null ? 0 : Math.round(bobotRaw * skorRaw * 10000) / 10000,
    }
    const g = groups.get(key) ?? { perspektif, perspektif_key: key, items: [] }
    g.items.push(item)
    groups.set(key, g)
  }

  const result: KpiGroup[] = [...groups.values()].map((g) => {
    const bobot = g.items.reduce((s, i) => s + i.bobot, 0)
    const skor = g.items.reduce((s, i) => s + i.skor, 0)
    const pct = bobot > 0 ? (skor * 100) / bobot : 0
    return {
      perspektif: g.perspektif,
      perspektif_key: g.perspektif_key,
      color: pct >= 100 ? 'green' : pct >= 80 ? 'yellow' : 'red',
      pct: Math.round(pct * 100) / 100,
      items: g.items,
    }
  })
  result.sort((a, b) => order.indexOf(a.perspektif_key) - order.indexOf(b.perspektif_key))
  return result
}

export async function kolegialDetailData(slug: string, periode?: string) {
  const direktur = Object.values(DIREKTUR_LIST).find((d) => d.slug === slug) ?? DIREKTUR_LIST.DIRUT
  const resolvedPeriode = periode ?? (await scorecardDefaultPeriode())
  const kpiGroups = await getDirekturKpiGroups(direktur.kode, resolvedPeriode)

  const flatItems = kpiGroups.flatMap((g) => g.items).map((it) => ({
    nama: it.nama, polaritas: it.polaritas, satuan: it.satuan,
    sasaran: it.target, realisasi: it.realisasi,
  }))
  const insight = deriveInsight(flatItems)

  return { direktur, kpiGroups, insight, periode: resolvedPeriode }
}

/** Mirror kolegial() — null kalau harus redirect ke detail (BOD non-eksekutif). */
export async function kolegialRedirectSlug(user: AuthUser): Promise<string | null> {
  const scope = await orgScopeForUser({ id: user.id, roleType: user.roleType, unitId: user.unitId, directorateId: user.directorateId })
  if (!scope.isExecutive && user.directorateId && user.directorate) {
    const aliased = CODE_ALIAS[user.directorate.code] ?? user.directorate.code
    return aliased.toLowerCase()
  }
  return null
}

export async function kolegialIndexData(user: AuthUser, periode?: string) {
  const resolvedPeriode = periode ?? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const rawGrid = await direktoratGrid(
    { id: user.id, roleType: user.roleType, unitId: user.unitId, directorateId: user.directorateId },
    resolvedPeriode,
  )
  const grid = rawGrid.map((g) => ({ ...g, kode: CODE_ALIAS[g.kode] ?? g.kode }))

  const totalKpi = grid.reduce((s, g) => s + (TOTAL_KPI_BY_CODE[g.kode] ?? 0), 0)
  const avgCapaian = grid.length > 0 ? Math.round((grid.reduce((s, g) => s + g.nilai, 0) / grid.length) * 10) / 10 : 0
  const memenuhi = grid.filter((d) => d.nilai >= 100).length
  const belowTarget = grid.filter((d) => d.nilai < 80)

  const stats: StatItem[] = [
    { label: 'Total KPI Kolegial', value: String(totalKpi), color: 'muted' },
    { label: 'Rata-rata Capaian', value: `${avgCapaian}%`, color: avgCapaian >= 90 ? 'green' : avgCapaian >= 80 ? 'yellow' : 'red' },
    { label: 'Memenuhi Target', value: String(memenuhi), sub: `dari ${grid.length} direktur`, color: memenuhi === grid.length ? 'green' : memenuhi >= grid.length / 2 ? 'yellow' : 'red' },
    { label: 'Di Bawah Target', value: String(belowTarget.length), sub: belowTarget.length ? `Dir. ${(belowTarget[0].nama.split(' ')[1] ?? '')} ${Math.round(belowTarget[0].nilai * 10) / 10}%` : '—', color: belowTarget.length ? 'red' : 'green' },
  ]

  const dirutRow = grid.find((g) => g.kode === 'DIRUT')
  const dirut: DirekturCard | null = dirutRow ? {
    ...(DIREKTUR_LIST[dirutRow.kode] ?? { kode: dirutRow.kode, nama: dirutRow.nama, jabatan: dirutRow.nama, slug: dirutRow.kode.toLowerCase() }),
    nilai: dirutRow.nilai, total_kpi: TOTAL_KPI_BY_CODE[dirutRow.kode] ?? 0, perspektif: PERSPEKTIF_BY_CODE[dirutRow.kode] ?? [],
  } : null

  const direktur: DirekturCard[] = grid.filter((g) => g.kode !== 'DIRUT').map((d) => ({
    ...(DIREKTUR_LIST[d.kode] ?? { kode: d.kode, nama: d.nama, jabatan: d.nama, slug: d.kode.toLowerCase() }),
    nilai: d.nilai, total_kpi: TOTAL_KPI_BY_CODE[d.kode] ?? 0,
  }))

  return { stats, dirut, direktur, periode: resolvedPeriode }
}

export type { InsightPayload }
