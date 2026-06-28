/* Port subset dari atlas-php Pages/Performance/_shared.ts — helper format KPI
 * yang dipakai Executive Summary + Performance views. */

export type ScoreTone = 'green' | 'amber' | 'red'

export function scoreTone(val: number): ScoreTone {
  if (val >= 100) return 'green'
  if (val >= 80) return 'amber'
  return 'red'
}

export function fillRatio(val: number, cap = 110): number {
  return Math.min(Math.max(val / cap, 0), 1)
}

export function formatNumber(val: number, decimals = 2): string {
  return val.toLocaleString('id-ID', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function formatPercent(val: number, decimals = 2): string {
  return `${formatNumber(val, decimals)}%`
}

export function formatVal(val: number | string, satuan: string): string {
  const num = typeof val === 'string' ? parseFloat(val.replace(',', '.')) : val
  if (typeof num !== 'number' || isNaN(num)) return String(val)
  const n = formatNumber(num, Number.isInteger(num) ? 0 : 2)
  const s = satuan.trim()
  if (s === 'Rp') return `Rp ${n}`
  if (s === 'Rp Miliar' || s === 'Rp M') return `Rp ${n} M`
  if (s === '%') return `${n}%`
  if (s === 'Jumlah' || s === 'Rasio' || s === 'Skor') return n
  return s ? `${n} ${s}` : n
}

/** Achievement % polaritas-aware, capped 110 (mirror _shared.realisasiPercent). */
export function realisasiPercent(
  sasaran: string | number,
  realisasi: string | number,
  polaritas: 'maximize' | 'minimize',
): number {
  const t = typeof sasaran === 'string' ? parseFloat(sasaran.replace(',', '.')) : sasaran
  const r = typeof realisasi === 'string' ? parseFloat(realisasi.replace(',', '.')) : realisasi
  if (isNaN(t) || isNaN(r)) return 0
  if (t === 0) return r === 0 ? 100 : 0
  const ratio = polaritas === 'maximize' ? r / t : t / Math.max(Math.abs(r), 0.0001)
  return Math.min(Math.abs(ratio) * 100, 110)
}

export function isZeroTargetMet(sasaran: number | string, realisasi: number | string): boolean {
  const t = typeof sasaran === 'string' ? parseFloat(sasaran.replace(',', '.')) : sasaran
  const r = typeof realisasi === 'string' ? parseFloat(realisasi.replace(',', '.')) : realisasi
  return t === 0 && r === 0
}

const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

export function formatPeriod(p: string): string {
  const m = /^(\d{4})-(\d{1,2})$/.exec(p)
  if (!m) return p
  const idx = parseInt(m[2], 10) - 1
  if (idx < 0 || idx > 11) return p
  return `${MONTHS_EN[idx]} ${m[1]}`
}
