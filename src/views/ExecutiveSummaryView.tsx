'use client'

import { useState } from 'react'
import { Head, usePage } from '@inertiajs/react'
import { Card, Pill } from '@/design-system'
import { scoreTone, fillRatio, formatPeriod } from '@/lib/perf-format'
import { InsightPanel } from '@/components/InsightPanel'
import { LeaderboardSection } from '@/components/LeaderboardSection'
import type {
  DirektoratCard, StatusBreakdown, PerhatianItem, InsightPayload, Performer,
} from '@/lib/executive'
import './ExecutiveSummaryView.css'

/* Port atlas-php Pages/ExecutiveSummaryView.tsx — 1-halaman snapshot eksekutif.
 * Trend (KpiTrendChart) di-omit: kosong di live untuk scope ini & chart-nya
 * belum diport; section di-gate `trend.series.length > 0`. */

type PageProps = {
  direktoratGrid: DirektoratCard[]
  trend: { periodes: { key: string; label: string }[]; series: { kode: string; nama: string; values: (number | null)[] }[] }
  programStatusBreakdown: StatusBreakdown
  perhatianKhusus: PerhatianItem[]
  insight: InsightPayload
  leaderboard: Record<string, Performer[]>
  periode: string
}

export default function ExecutiveSummaryView() {
  const {
    direktoratGrid, trend, programStatusBreakdown,
    perhatianKhusus, insight, leaderboard, periode,
  } = usePage<PageProps>().props

  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const periodeLabel = formatPeriod(periode)

  const handleExport = async () => {
    setExporting(true)
    setExportError(null)
    try {
      const mod = await import('@/lib/exporters/executiveSummaryPptx')
      await mod.exportExecutiveSummary({
        direktoratGrid, trend, programStatusBreakdown,
        perhatianKhusus, insight, leaderboard, periode, periodeLabel,
      })
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <Head title="Executive Summary" />
      <div className="page-shell">
        <div className="page-shell__inner">
          <div className="exec-page" data-exec-root>
            <header className="exec-page__head">
              <div>
                <h1 className="exec-page__title">Executive Summary</h1>
                <p className="exec-page__lede">Program Monitoring · Period through {periodeLabel}</p>
              </div>
              <div className="exec-page__actions">
                <Pill tone="neutral" variant="soft">{periodeLabel}</Pill>
                <button type="button" className="exec-export-btn" onClick={handleExport} disabled={exporting}>
                  {exporting ? 'Preparing PPTX…' : 'Export PPTX'}
                </button>
              </div>
            </header>

            {exportError && <div className="exec-export-error">{exportError}</div>}

            {/* ─── KPI Target Achievement — direktorat grid ─── */}
            <section className="exec-section">
              <div className="exec-section__head">
                <span className="exec-section__label">KPI Target Achievement</span>
                <span className="exec-section__meta">{direktoratGrid.length} directorates · aggregate score per month</span>
              </div>
              <div className="exec-kpi-grid">
                {direktoratGrid.slice(0, 6).map(d => {
                  const tone = scoreTone(d.nilai)
                  const bar = fillRatio(d.nilai) * 100
                  return (
                    <Card key={d.kode} padding="md" className="exec-kpi-card">
                      <div className="exec-kpi-card__head">
                        <span className="exec-kpi-card__eyebrow">{d.kode}</span>
                        <span className="exec-kpi-card__name">{d.nama}</span>
                      </div>
                      <div className="exec-kpi-card__score" data-tone={tone}>{d.nilai.toFixed(1)}%</div>
                      <div className="exec-kpi-card__bar">
                        <div className="exec-kpi-card__bar-fill" data-tone={tone} style={{ width: `${bar}%` }} />
                      </div>
                      {d.divisi.length > 0 && (
                        <div className="exec-kpi-card__divisi">
                          {d.divisi.map(div => (
                            <div key={div.kode} className="exec-kpi-card__divisi-row">
                              <span className="exec-kpi-card__divisi-name">{div.nama}</span>
                              <span className="exec-kpi-card__divisi-value" data-tone={scoreTone(div.nilai)}>{div.nilai.toFixed(1)}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  )
                })}
              </div>
            </section>

            {/* ─── Program Status 4-card ─── */}
            <section className="exec-section">
              <div className="exec-section__head">
                <span className="exec-section__label">Program Status</span>
                <span className="exec-section__meta">{programStatusBreakdown.total} active programs · breakdown by status</span>
              </div>
              <div className="exec-status-grid">
                <StatusCard label="On Track" tone="green" count={programStatusBreakdown.onTrack} pct={programStatusBreakdown.pctOnTrack} />
                <StatusCard label="Completed" tone="blue" count={programStatusBreakdown.completed} pct={programStatusBreakdown.pctCompleted} />
                <StatusCard label="At Risk" tone="amber" count={programStatusBreakdown.atRisk} pct={programStatusBreakdown.pctAtRisk} />
                <StatusCard label="Delayed" tone="red" count={programStatusBreakdown.terlambat} pct={programStatusBreakdown.pctTerlambat} />
              </div>
            </section>

            {/* ─── KPI Achievement Highlights ─── */}
            <section className="exec-section">
              <div className="exec-section__head">
                <span className="exec-section__label">KPI Achievement Highlights</span>
                <span className="exec-section__meta">Auto-derived from actual vs target values</span>
              </div>
              <InsightPanel insight={insight} />
            </section>

            {/* ─── Needs Attention ─── */}
            {perhatianKhusus.length > 0 && (
              <section className="exec-section">
                <div className="exec-section__head">
                  <span className="exec-section__label">Needs Attention</span>
                  <span className="exec-section__meta">At Risk / Delayed programs · sorted by deadline priority</span>
                </div>
                <div className="exec-perhatian-grid">
                  {perhatianKhusus.map(p => (
                    <article key={p.id} className="exec-perhatian-card" data-status={p.status === 'Delayed' ? 'red' : 'amber'}>
                      <header className="exec-perhatian-card__head">
                        <span className="exec-perhatian-card__badge" data-status={p.status === 'Delayed' ? 'red' : 'amber'}>{p.status}</span>
                        {p.deadline && (
                          <span className="exec-perhatian-card__deadline">
                            {p.deadline}
                            {p.daysLeft !== null && p.daysLeft >= 0 && (
                              <span className="exec-perhatian-card__days"> · {p.daysLeft} days left</span>
                            )}
                          </span>
                        )}
                      </header>
                      <h3 className="exec-perhatian-card__title">{p.name}</h3>
                      {p.progress && <p className="exec-perhatian-card__progress">{p.progress}</p>}
                      {p.dukungan && (
                        <div className="exec-perhatian-card__dukungan">
                          <span className="exec-perhatian-card__dukungan-label">Support needed</span>
                          <p>{p.dukungan}</p>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            )}

            {/* ─── KPI Leaderboard BOD ─── */}
            <section className="exec-section">
              <div className="exec-section__head">
                <span className="exec-section__label">KPI Leaderboard</span>
                <span className="exec-section__meta">Top performers per BOD level</span>
              </div>
              <LeaderboardSection topPerformers={leaderboard} periode={periodeLabel} />
            </section>
          </div>
        </div>
      </div>
    </>
  )
}

function StatusCard({ label, tone, count, pct }: {
  label: string; tone: 'green' | 'blue' | 'amber' | 'red'; count: number; pct: number
}) {
  return (
    <Card padding="md" className="exec-status-card" data-tone={tone}>
      <div className="exec-status-card__count" data-tone={tone}>{count}</div>
      <div className="exec-status-card__label">{label}</div>
      <div className="exec-status-card__pct">{pct}%</div>
    </Card>
  )
}
