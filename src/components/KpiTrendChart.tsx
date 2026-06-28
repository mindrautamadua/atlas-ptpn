'use client'

import { useMemo } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { formatPercent, scoreTone } from '@/lib/perf-format'
import type { ScorecardTrend } from '@/lib/scorecard'

/* Port atlas-php Pages/Performance/KpiTrendChart.tsx — bar chart skor KPI per
 * direktorat. <4 bulan berisi → ringkasan sparse (mirror Home gating). */

export type KpiTrendPayload = ScorecardTrend

const DIRECTORATE_COLORS: Record<string, string> = {
  DIRUT: '#0ea5e9', DBS: '#a855f7', DAS: '#f97316', DPP: '#22c55e',
  DSU: '#06b6d4', DKM: '#16a34a', 'DIR-KMR': '#16a34a',
}
const DEFAULT_PALETTE = ['#0ea5e9', '#a855f7', '#f97316', '#22c55e', '#06b6d4', '#16a34a', '#ec4899', '#eab308']
function colorFor(kode: string, idx: number): string {
  return DIRECTORATE_COLORS[kode] ?? DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length]
}

export function KpiTrendChart({ trend, height = 260 }: { trend: KpiTrendPayload; height?: number }) {
  const data = useMemo(() => {
    if (!trend.periodes.length || !trend.series.length) return []
    return trend.periodes.map((p, i) => {
      const row: Record<string, string | number | null> = { label: p.label, key: p.key }
      trend.series.forEach((s) => { row[s.kode] = s.values[i] })
      return row
    })
  }, [trend])

  if (data.length === 0) {
    return <div className="kpi-trend-empty">No scorecard data for this period yet.</div>
  }

  const filledPeriods = trend.periodes.filter((_, i) => trend.series.some((s) => s.values[i] != null)).length
  if (filledPeriods < 4) return <SparseTrendSummary trend={trend} />

  return (
    <div className="kpi-trend-chart">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 12, right: 16, left: 4, bottom: 6 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--panel-border, #e5e7eb)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted, #6b7280)' }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 110]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 11, fill: 'var(--text-muted, #6b7280)' }} axisLine={false} tickLine={false} width={32} />
          <Tooltip
            contentStyle={{ background: 'var(--bg-elevated, #fff)', border: '1px solid var(--panel-border, #e5e7eb)', borderRadius: 6, fontSize: 12 }}
            formatter={(value) => {
              const n = typeof value === 'number' ? value : Number(value)
              return [Number.isFinite(n) ? formatPercent(n, 1) : '—', '']
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconType="circle" iconSize={8} />
          {trend.series.map((s, idx) => (
            <Bar key={s.kode} dataKey={s.kode} name={s.nama} fill={colorFor(s.kode, idx)} radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false}>
              {data.map((_, i) => <Cell key={i} fill={colorFor(s.kode, idx)} />)}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function SparseTrendSummary({ trend }: { trend: KpiTrendPayload }) {
  const rows = trend.series.map((s) => {
    const filled = s.values
      .map((v, i) => ({ v, label: trend.periodes[i]?.label ?? '' }))
      .filter((x): x is { v: number; label: string } => x.v != null)
    const last = filled[filled.length - 1] ?? null
    const prev = filled.length > 1 ? filled[filled.length - 2] : null
    return { kode: s.kode, nama: s.nama, last, prev }
  }).filter((r) => r.last !== null)

  if (rows.length === 0) return <div className="kpi-trend-empty">No scorecard data for this period yet.</div>

  return (
    <div className="kpi-trend-sparse">
      {rows.map((r) => {
        const delta = r.prev ? r.last!.v - r.prev.v : null
        const deltaTone = delta == null ? 'neutral' : delta >= 0 ? 'green' : 'red'
        return (
          <div key={r.kode} className="kpi-trend-sparse__row">
            <div className="kpi-trend-sparse__meta">
              <span className="kpi-trend-sparse__name">{r.nama}</span>
              <span className="kpi-trend-sparse__period">{r.last!.label}</span>
            </div>
            <span className="kpi-trend-sparse__value" data-tone={scoreTone(r.last!.v)}>{formatPercent(r.last!.v, 1)}</span>
            <span className="kpi-trend-sparse__delta" data-tone={deltaTone}>
              {delta == null ? 'first month' : `${delta >= 0 ? '▲' : '▼'} ${formatPercent(Math.abs(delta), 1)} vs ${r.prev!.label}`}
            </span>
          </div>
        )
      })}
      <p className="kpi-trend-sparse__note">Monthly trend chart appears once 4+ months of scorecard history are available.</p>
    </div>
  )
}
