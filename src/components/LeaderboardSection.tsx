import { Card } from '@/design-system'
import { scoreTone } from '@/lib/perf-format'
import type { Performer } from '@/lib/executive'

/* Port atlas-php Pages/Performance/LeaderboardSection.tsx — leaderboard BOD-1/-2/-3
 * dengan medal styling top-3. */

export function LeaderboardSection({ topPerformers, periode }: {
  topPerformers: Record<string, Performer[]>
  periode?: string
}) {
  const groups = Object.entries(topPerformers)
  if (groups.length === 0) return null

  return (
    <div className="perf-leaderboard">
      {groups.map(([bodLabel, performers]) => (
        <Card key={bodLabel} padding="md">
          <div className="perf-card-head">
            <h2 className="perf-card-head__title">{bodLabel}</h2>
            <span className="perf-rank__sub">{periode ? `Score ${periode}` : 'Score this month'}</span>
          </div>
          <div className="perf-leaderboard__list">
            {performers.map((p) => {
              const tone = scoreTone(p.nilai)
              return (
                <div key={p.nama} className="perf-rank perf-rank--static">
                  <span className="perf-rank__num" data-rank={p.rank}>{p.rank}</span>
                  <div className="perf-rank__info">
                    <div className="perf-rank__name">{p.nama}</div>
                    <div className="perf-rank__sub">{p.jabatan} · {p.unit}</div>
                  </div>
                  <span className="perf-rank__value" data-tone={tone}>{p.nilai.toFixed(2)}</span>
                </div>
              )
            })}
          </div>
        </Card>
      ))}
    </div>
  )
}
