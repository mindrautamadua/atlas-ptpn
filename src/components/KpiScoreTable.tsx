'use client'

import { useState } from 'react'
import { scoreTone, realisasiPercent, formatVal, formatNumber, formatPercent, isZeroTargetMet } from '@/lib/perf-format'

/* Port atlas-php Pages/Performance/KpiScoreTable.tsx — scorecard table KPI vs
 * target dengan deviation bar berjangkar 100%. */

export type ScoreRow = {
  no: number | string
  kode: string
  nama: string
  definisi?: string | null
  satuan: string
  polaritas: 'maximize' | 'minimize'
  bobot: number
  target: number | string
  realisasi: number | string
  skor: number
}

export type ScoreGroup = {
  key: string
  label: string
  color: string
  bobot: number
  pct: number
  items: ScoreRow[]
}

export function rowPct(r: ScoreRow): number {
  return realisasiPercent(r.target, r.realisasi, r.polaritas)
}

export function DeviationBar({ pct }: { pct: number }) {
  const tone = scoreTone(pct)
  const over = pct >= 100
  const raw = over ? (Math.min(pct - 100, 10) / 10) * 25 : (Math.min(100 - pct, 30) / 30) * 75
  const width = Math.max(raw, 0.75)
  const left = over ? 75 : 75 - width
  return (
    <div className="kst-dev" role="img" aria-label={`${formatPercent(pct, 1)} of target`}>
      <span className="kst-dev__baseline" aria-hidden />
      <span className="kst-dev__fill" data-tone={tone} data-dir={over ? 'over' : 'under'} style={{ left: `${left}%`, width: `${width}%` }} aria-hidden />
    </div>
  )
}

export function KpiScoreTable({ groups }: { groups: ScoreGroup[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggle = (k: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })

  return (
    <div className="kst">
      <div className="kst__headrow" aria-hidden>
        <span />
        <span>KPI</span>
        <span className="kst__num">Weight</span>
        <span className="kst__num">Target</span>
        <span className="kst__num">Realization</span>
        <span className="kst__ach-head">Achievement · tick = 100%</span>
        <span className="kst__num">Score</span>
      </div>

      {groups.map((g) => {
        const isCollapsed = collapsed.has(g.key)
        return (
          <section key={g.key} className="kst__group">
            <button type="button" className="kst__group-head" aria-expanded={!isCollapsed} onClick={() => toggle(g.key)}>
              <span className="kst__chevron" data-collapsed={isCollapsed} aria-hidden>▾</span>
              <span className="kst__dot" style={{ background: g.color }} aria-hidden />
              <span className="kst__group-label">{g.label}</span>
              <span className="kst__group-meta">{g.items.length} KPI · weight {formatNumber(g.bobot, 0)}%</span>
              <span className="kst__group-pct" data-tone={scoreTone(g.pct)}>{formatPercent(g.pct, 1)}</span>
            </button>

            {!isCollapsed && g.items.map((r) => {
              const pct = rowPct(r)
              const tone = scoreTone(pct)
              const zeroMet = isZeroTargetMet(r.target, r.realisasi)
              const isNA = r.realisasi === '—'
              return (
                <div key={r.kode} className="kst__row" data-tone={zeroMet ? 'green' : isNA ? undefined : tone}>
                  <span className="kst__cell kst__cell--no">{r.no}</span>
                  <div className="kst__cell kst__cell--kpi">
                    <span className="kst__kpi-name">{r.nama}</span>
                    <span className="kst__kpi-sub">
                      <span className="kst__kpi-code">{r.kode}</span>
                      <span aria-hidden>·</span>
                      <span>{r.polaritas === 'maximize' ? '↑' : '↓'} {r.satuan || '—'}</span>
                      {r.definisi && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="kst__kpi-def" title={r.definisi}>{r.definisi}</span>
                        </>
                      )}
                    </span>
                  </div>
                  <span className="kst__cell kst__num" data-label="Weight">{formatNumber(r.bobot, 0)}%</span>
                  <span className="kst__cell kst__num" data-label="Target">{formatVal(r.target, r.satuan)}</span>
                  <span className="kst__cell kst__num" data-label="Realization">
                    {isNA
                      ? <span className="kst__na" title="Not yet measured for this period">N/A</span>
                      : <span data-tone={tone} className="kst__val">{formatVal(r.realisasi, r.satuan)}</span>}
                  </span>
                  <div className="kst__cell kst__cell--ach">
                    {zeroMet ? (
                      <span className="kst__zero" data-tone="green">✓ zero target met</span>
                    ) : isNA ? (
                      <span className="kst__na">not measured</span>
                    ) : (
                      <>
                        <DeviationBar pct={pct} />
                        <span className="kst__ach-pct" data-tone={tone}>{formatPercent(pct, 0)}</span>
                      </>
                    )}
                  </div>
                  <span className="kst__cell kst__num kst__score" data-label="Score" data-tone={zeroMet ? 'green' : isNA ? undefined : tone}>
                    {formatNumber(r.skor, 1)}
                  </span>
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
