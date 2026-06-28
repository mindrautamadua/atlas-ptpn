'use client'

import type { ElementType } from 'react'
import { Head, Link, usePage } from '@inertiajs/react'
import { Card, Pill, Gauge, Meter } from '@/design-system'
import { scoreTone, fillRatio, formatNumber, formatPercent, formatPeriod } from '@/lib/perf-format'
import { KpiTrendChart } from '@/components/KpiTrendChart'
import { ExceptionsCard } from '@/components/ExceptionsCard'
import type { ScorecardRankItem, ScorecardMatrixRow, ScorecardExceptionRow, ScorecardTrend } from '@/lib/scorecard'
import './Performance.css'

/* Port atlas-php Pages/Performance/ScorecardView.tsx — kokpit scorecard
 * direktorat (solo = matriks BSC×divisi + exceptions + trend). */

type DirektoratCard = { kode: string; nama: string; nilai: number; divisi: { kode: string; nama: string; nilai: number }[] }

type PageProps = {
  topDirektorat: ScorecardRankItem[]
  topDivisi: ScorecardRankItem[]
  direktoratGrid: DirektoratCard[]
  trend: ScorecardTrend
  periode: string
  matrix: ScorecardMatrixRow[]
  exceptions: ScorecardExceptionRow[]
  kpiTotals: { total: number; onTarget: number }
}

function cellIntensity(v: number): number {
  return Math.min(Math.max(Math.abs(v - 100) / 12, 0.1), 0.85)
}

const MATRIX_COLS: Array<{ key: string; label: string }> = [
  { key: 'Financial', label: 'Financial' },
  { key: 'Customer', label: 'Customer' },
  { key: 'Internal Business Process', label: 'IBP' },
  { key: 'L&G', label: 'L&G' },
]

function RankWithBar({ item, onClick, href }: { item: ScorecardRankItem; onClick?: () => void; href?: string }) {
  const tone = scoreTone(item.nilai)
  const barPct = fillRatio(item.nilai) * 100
  const RowTag = (href ? Link : 'div') as ElementType
  const interactive = Boolean(href || onClick)
  return (
    <RowTag href={href} onClick={onClick} className={`perf-rank-bar${interactive ? '' : ' perf-rank-bar--static'}`}>
      <span className="perf-rank-bar__num" data-rank={item.rank}>{item.rank}</span>
      <div className="perf-rank-bar__main">
        <div className="perf-rank-bar__name">{item.nama}</div>
        {item.sub && <div className="perf-rank-bar__sub">{item.sub}</div>}
      </div>
      <div className="perf-rank-bar__viz">
        <div className="perf-rank-bar__track">
          <div className="perf-rank-bar__fill" data-tone={tone} style={{ width: `${barPct}%` }} />
        </div>
        <span className="perf-rank-bar__value" data-tone={tone}>{formatPercent(item.nilai)}</span>
      </div>
    </RowTag>
  )
}

export default function ScorecardView() {
  const { topDirektorat, topDivisi, direktoratGrid, trend, periode, matrix, exceptions, kpiTotals } =
    usePage<PageProps>().props

  const totalDirektorat = direktoratGrid.length
  const avgScore = totalDirektorat > 0 ? direktoratGrid.reduce((s, d) => s + d.nilai, 0) / totalDirektorat : 0
  const belowTargetCount = direktoratGrid.filter((d) => d.nilai < 80).length

  const soloDir = totalDirektorat === 1 ? direktoratGrid[0] : null

  const soloDelta = (() => {
    if (!soloDir || !trend?.series?.length) return null
    const s = trend.series.find((x) => x.kode === soloDir.kode) ?? trend.series[0]
    const filled = s.values
      .map((v, i) => ({ v, label: trend.periodes[i]?.label ?? '' }))
      .filter((x): x is { v: number; label: string } => x.v != null)
    if (filled.length < 2) return null
    const last = filled[filled.length - 1], prev = filled[filled.length - 2]
    return { value: last.v - prev.v, vs: prev.label }
  })()

  const periodeLabel = formatPeriod(periode)

  return (
    <>
      <Head title="Scorecard" />
      <div className="ds perf view-performance">
        <div className="perf__inner ds-stagger">
          <header className="perf__header">
            <div className="perf__header-left">
              <h1 className="perf__title">Scorecard</h1>
              <span className="perf__subtitle">Directorate &amp; division ranking</span>
            </div>
            <div className="perf__header-summary">
              {soloDir ? null : (
                <>
                  <span className="perf__header-stat">
                    <strong data-tone={scoreTone(avgScore)} data-num>{formatPercent(avgScore, 1)}</strong>
                    <span>average</span>
                  </span>
                  <span className="perf__header-divider" aria-hidden />
                  <span className="perf__header-stat">
                    <strong data-num>{totalDirektorat}</strong>
                    <span>{totalDirektorat === 1 ? 'directorate' : 'directorates'}</span>
                  </span>
                  {belowTargetCount > 0 && (
                    <>
                      <span className="perf__header-divider" aria-hidden />
                      <span className="perf__header-stat">
                        <strong data-tone="red" data-num>{belowTargetCount}</strong>
                        <span>below target</span>
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
            <div className="perf__header-actions">
              <span className="perf__period-pill"><IconCalendar />{periodeLabel}</span>
            </div>
          </header>

          {direktoratGrid.length === 0 && (
            <Card padding="lg" className="perf__section perf-empty">
              <div className="perf-empty__title">No scorecard data yet</div>
              <div>Directorate and division scores are not available for the {periodeLabel} period.</div>
            </Card>
          )}

          {soloDir ? (
            <>
              <Card padding="none" className="perf__section perf-hero perf-hero--rich" data-tone={scoreTone(soloDir.nilai)}>
                <div className="perf-hero__verdict">
                  <span className="perf-hero__eyebrow">Directorate scorecard · {periodeLabel}</span>
                  <h2 className="perf-hero__name">{soloDir.nama}</h2>
                  <div className="perf-hero__numrow">
                    <span className="perf-hero__num" data-tone={scoreTone(soloDir.nilai)}>
                      {formatNumber(soloDir.nilai, 1)}<span className="perf-hero__num-unit">%</span>
                    </span>
                    {soloDelta && (
                      <span className="perf__header-delta" data-tone={soloDelta.value >= 0 ? 'green' : 'red'}>
                        {soloDelta.value >= 0 ? '▲' : '▼'} {formatPercent(Math.abs(soloDelta.value), 1)} vs {soloDelta.vs}
                      </span>
                    )}
                  </div>
                  <span className="perf-hero__sub">vs target 100% · {periodeLabel}</span>
                </div>

                <div className="perf-hero__divisions">
                  {[...soloDir.divisi].sort((a, b) => b.nilai - a.nilai).map((d) => (
                    <Link key={d.kode} href={`/performance/divisi/${d.kode.replace('-HLD', '').toLowerCase()}`} className="perf-hero__divrow">
                      <span className="perf-hero__divcode">{d.kode.replace('-HLD', '')}</span>
                      <Meter value={Math.min(d.nilai, 110)} max={110} target={100} tone={scoreTone(d.nilai)} height={7} className="perf-hero__divbar" />
                      <span className="perf-hero__divval" data-tone={scoreTone(d.nilai)}>{formatNumber(d.nilai, 1)}</span>
                    </Link>
                  ))}
                </div>

                <div className="perf-hero__gauge">
                  <Gauge
                    value={kpiTotals.onTarget}
                    max={kpiTotals.total || 1}
                    tone={kpiTotals.onTarget === kpiTotals.total ? 'green' : 'amber'}
                    size={148}
                    thickness={14}
                    valueText={`${kpiTotals.onTarget}`}
                    unit={`/${kpiTotals.total}`}
                    label="KPIs on target"
                  />
                </div>
              </Card>

              <div className="perf-cockpit perf__section">
                <section>
                  <div className="perf-section-head">
                    <span className="perf__section-label">BSC Perspective × Division</span>
                    <span className="perf-section-meta">click a division to drill down</span>
                  </div>
                  <Card padding="none" className="perf-matrix-card">
                    <ScoreMatrix rows={matrix} />
                  </Card>
                </section>

                <div className="perf-cockpit__aside">
                  <div className="perf-section-head">
                    <span className="perf__section-label">This month</span>
                    <span className="perf-section-meta">across all divisions</span>
                  </div>
                  <ExceptionsCard exceptions={exceptions} total={kpiTotals.total} />

                  {trend && trend.series.length > 0 && (
                    <Card padding="md">
                      <div className="perf-card-head">
                        <h2 className="perf-card-head__title">Score trend</h2>
                        <Pill tone="neutral" variant="soft">
                          {trend.periodes[0]?.label} – {trend.periodes[trend.periodes.length - 1]?.label}
                        </Pill>
                      </div>
                      <KpiTrendChart trend={trend} height={220} />
                    </Card>
                  )}
                </div>
              </div>
            </>
          ) : direktoratGrid.length > 0 && (
            <div className="perf__cols-2 perf__section">
              <Card padding="md">
                <div className="perf-card-head">
                  <h2 className="perf-card-head__title">Top 3 Directorates</h2>
                  <Pill tone="neutral" variant="soft">{periodeLabel}</Pill>
                </div>
                <div className="perf-rank-bar-list">
                  {topDirektorat.map((item) => <RankWithBar key={item.nama} item={item} />)}
                </div>
              </Card>
              <Card padding="md">
                <div className="perf-card-head">
                  <h2 className="perf-card-head__title">Top 3 Divisions</h2>
                  <Pill tone="neutral" variant="soft">{periodeLabel}</Pill>
                </div>
                <div className="perf-rank-bar-list">
                  {topDivisi.map((item) => (
                    <RankWithBar key={item.kode || item.nama} item={item} href={`/performance/divisi/${(item.kode ?? '').toLowerCase()}`} />
                  ))}
                </div>
              </Card>
            </div>
          )}

          {!soloDir && trend && trend.series.length > 0 && (
            <section className="perf__section">
              <div className="perf-section-head">
                <span className="perf__section-label">KPI Score Trend</span>
                <span className="perf-section-meta">
                  {trend.periodes[0]?.label} – {trend.periodes[trend.periodes.length - 1]?.label} · by directorate
                </span>
              </div>
              <Card padding="md"><KpiTrendChart trend={trend} /></Card>
            </section>
          )}

          {!soloDir && direktoratGrid.length > 0 && (
            <section className="perf__section">
              <div className="perf-section-head">
                <span className="perf__section-label">All Directorates</span>
                <span className="perf-section-meta">{totalDirektorat} directorates · drill down for details</span>
              </div>
              <div className="perf-direktorat-grid">
                {direktoratGrid.map((d) => {
                  const tone = scoreTone(d.nilai)
                  const barPct = fillRatio(d.nilai) * 100
                  return (
                    <Card key={d.kode} padding="none" className="perf-direktorat">
                      <Link href={`/performance/kolegial/${d.kode.toLowerCase()}`} className="perf-direktorat__head">
                        <span className="perf-direktorat__name">{d.nama}</span>
                        <span className="perf-direktorat__total" data-tone={tone}>
                          {formatNumber(d.nilai)}<span className="perf-direktorat__unit">%</span>
                        </span>
                      </Link>
                      <div className="perf-direktorat__bar">
                        <div className="perf-direktorat__bar-fill" data-tone={tone} style={{ width: `${barPct}%` }} />
                      </div>
                      <div className="perf-direktorat__divisi">
                        {d.divisi.map((div) => {
                          const dt = scoreTone(div.nilai)
                          return (
                            <Link key={div.kode} href={`/performance/divisi/${div.kode.toLowerCase()}`} className="perf-divisi-row" title={div.nama}>
                              <span className="perf-divisi-row__code">{div.kode}</span>
                              <span className="perf-divisi-row__name">{div.nama}</span>
                              <span className="perf-divisi-row__value" data-tone={dt}>{formatPercent(div.nilai)}</span>
                            </Link>
                          )
                        })}
                      </div>
                    </Card>
                  )
                })}
              </div>
            </section>
          )}

          <div className="perf-legend" role="note">
            <span className="perf-legend__item"><span className="perf-legend__dot" data-tone="red" />&lt; 80% below target</span>
            <span className="perf-legend__item"><span className="perf-legend__dot" data-tone="amber" />80–99% needs attention</span>
            <span className="perf-legend__item"><span className="perf-legend__dot" data-tone="green" />≥ 100% meets target</span>
            <span className="perf-legend__item perf-legend__item--muted">Maximum scale 110%</span>
          </div>
        </div>
      </div>
    </>
  )
}

function ScoreMatrix({ rows }: { rows: ScorecardMatrixRow[] }) {
  const perspectives = MATRIX_COLS.filter((c) => rows.some((r) => r.perspektif[c.key] != null))
  return (
    <div
      className="perf-matrix perf-matrix--transposed"
      role="table"
      aria-label="BSC perspective by division achievement"
      style={{ ['--matrix-cols' as never]: rows.length }}
    >
      <div className="perf-matrix__row perf-matrix__row--head" role="row">
        <span className="perf-matrix__rowlabel" role="columnheader">Perspective</span>
        {rows.map((r) => (
          <Link
            key={r.kode}
            href={`/performance/divisi/${r.kode.replace('-HLD', '').toLowerCase()}`}
            className="perf-matrix__cell perf-matrix__cell--head perf-matrix__cell--divhead"
            role="columnheader"
            title={r.nama}
          >
            {r.kode.replace('-HLD', '')}
          </Link>
        ))}
      </div>

      {perspectives.map((p) => (
        <div key={p.key} className="perf-matrix__row" role="row">
          <span className="perf-matrix__rowlabel" role="cell" title={p.key}>{p.label}</span>
          {rows.map((r) => {
            const v = r.perspektif[p.key]
            return (
              <span
                key={r.kode}
                className="perf-matrix__cell"
                data-tone={v == null ? undefined : scoreTone(v)}
                style={v == null ? undefined : ({ ['--i' as never]: cellIntensity(v) })}
                role="cell"
              >
                {v == null ? '—' : formatPercent(v, 1)}
              </span>
            )
          })}
        </div>
      ))}

      <div className="perf-matrix__row perf-matrix__row--total" role="row">
        <span className="perf-matrix__rowlabel" role="cell">Total</span>
        {rows.map((r) => (
          <span key={r.kode} className="perf-matrix__cell perf-matrix__cell--total" data-tone={scoreTone(r.nilai)} style={{ ['--i' as never]: cellIntensity(r.nilai) }} role="cell">
            {formatPercent(r.nilai, 1)}
          </span>
        ))}
      </div>

      <div className="perf-matrix__row" role="row">
        <span className="perf-matrix__rowlabel" role="cell">On target</span>
        {rows.map((r) => (
          <span key={r.kode} className="perf-matrix__cell perf-matrix__cell--kpis" data-tone={r.onTarget === r.kpiTotal ? 'green' : 'amber'} style={{ ['--i' as never]: r.onTarget === r.kpiTotal ? 0.1 : 0.25 }} role="cell">
            {r.onTarget}/{r.kpiTotal}
          </span>
        ))}
      </div>
    </div>
  )
}

function IconCalendar() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <rect x="1" y="2" width="12" height="11" rx="1.5" />
      <path d="M1 6h12M5 2v2M9 2v2" />
    </svg>
  )
}
