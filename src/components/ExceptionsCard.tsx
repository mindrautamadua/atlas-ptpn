import { Link } from '@inertiajs/react'
import { Card, Pill } from '@/design-system'
import { scoreTone, formatNumber, formatPercent, formatVal } from '@/lib/perf-format'
import type { ScorecardExceptionRow } from '@/lib/scorecard'

/* Port atlas-php Pages/Performance/ExceptionsCard.tsx — daftar KPI <100%
 * lintas-divisi, terburuk dulu, klik baris → halaman divisi. */

export function ExceptionsCard({ exceptions, total }: { exceptions: ScorecardExceptionRow[]; total?: number }) {
  return (
    <Card padding="md">
      <div className="perf-card-head">
        <h2 className="perf-card-head__title">Needs attention</h2>
        <Pill tone={exceptions.length > 0 ? 'amber' : 'green'} variant="soft">
          {exceptions.length > 0 ? `${exceptions.length} KPI below 100%` : 'all on target'}
        </Pill>
      </div>
      {exceptions.length === 0 ? (
        <p className="perf-empty">All {total ?? ''} division KPIs meet 100% of target this period.</p>
      ) : (
        <div className="perf-exc-list">
          {exceptions.map((e) => {
            const bare = e.divisi.replace('-HLD', '')
            return (
              <Link
                key={`${e.divisi}-${e.kpi}`}
                href={`/performance/divisi/${bare.toLowerCase()}`}
                className="perf-exc"
                data-sev={e.pct < 80 ? 'red' : 'amber'}
              >
                <span className="perf-exc__divisi">{bare}</span>
                <span className="perf-exc__main">
                  <span className="perf-exc__kpi">{e.kpi}</span>
                  <span className="perf-exc__detail">
                    {e.realisasi === '—'
                      ? 'not measured yet'
                      : `${formatVal(e.realisasi, e.satuan)} of ${formatVal(e.sasaran, e.satuan)} target`}
                    {' · '}weight {formatNumber(e.bobot, 0)}%
                  </span>
                </span>
                <span className="perf-exc__pct" data-tone={scoreTone(e.pct)}>
                  {e.realisasi === '—' ? 'N/A' : formatPercent(e.pct, 0)}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </Card>
  )
}
