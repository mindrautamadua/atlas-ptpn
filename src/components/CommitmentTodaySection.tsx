'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { useInertiaNavigate } from '@/hooks/useInertiaNavigate'
import { CollapsibleSection } from '@/components/ui'
import type { CommitmentItem, CommitmentPayload } from '@/lib/inbox'

/* Port atlas-php InboxView — Sprint 2 "Today's Commitments" (data dari /inbox/today). */

const kindLabel: Record<CommitmentItem['kind'], string> = {
  task: 'Task',
  action_item: 'Action Item',
  assignment: 'Assignment',
}

export function CommitmentTodaySection() {
  const navigate = useInertiaNavigate()
  const [data, setData] = useState<CommitmentPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.get<CommitmentPayload>('/inbox/today')
      .then(payload => { if (!cancelled) { setData(payload); setLoading(false) } })
      .catch(err => { if (!cancelled) { setError(err?.message || 'Failed to load'); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  const handleClick = (item: CommitmentItem) => {
    if (item.kind === 'task') navigate(`/execution/tasks/${item.id}`)
    else if (item.kind === 'assignment') navigate('/penugasan')
    else if (item.kind === 'action_item' && item.meetingId) navigate('/jadwal')
  }

  return (
    <CollapsibleSection
      title="Today's Commitments"
      count={data?.count ?? 0}
      summary={data ? `${data.breakdown.task} tasks · ${data.breakdown.action_item} actions · ${data.breakdown.assignment} assignments` : undefined}
      defaultOpen
      persistKey="inbox.commitment-today"
    >
      {loading && (
        <div style={{ padding: '8px 0', fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>
      )}
      {error && (
        <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--red, #c33)' }}>
          Failed to load commitments: {error}
        </div>
      )}
      {!loading && !error && data && data.items.length === 0 && (
        <div style={{ padding: '12px', fontSize: 13, color: 'var(--text-muted)' }}>
          No urgent commitments today. Nice — focus on what matters before it gets urgent.
        </div>
      )}
      {!loading && !error && data && data.items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {data.items.map(item => (
            <button
              key={`${item.kind}-${item.id}`}
              type="button"
              onClick={() => handleClick(item)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', border: '1px solid var(--panel-border)',
                borderRadius: 8, background: 'var(--panel)', cursor: 'pointer',
                textAlign: 'left', font: 'inherit', color: 'var(--text)',
              }}
            >
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 6px',
                borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>{kindLabel[item.kind]}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{item.title}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.status}</span>
            </button>
          ))}
        </div>
      )}
    </CollapsibleSection>
  )
}
