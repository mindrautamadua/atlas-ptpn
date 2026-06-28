'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { useFeatureFlag } from '@/hooks/useFeatureFlag'
import { CollapsibleSection, AgingIndicator } from '@/components/ui'
import { EscalationTriagePanel, type EscalationRequest } from '@/components/Escalation'

/* Port dari atlas-php InboxView — Sprint 4 "Clear the Path" sections.
 * Dua bagian: "My Clear the Path Requests" (incoming, REQUESTED) + "Escalations
 * I Raised" (mine, non-terminal). Klik baris → EscalationTriagePanel. */

export function EscalationSections({ currentUserId }: { currentUserId: number }) {
  const enabled = useFeatureFlag('clear-the-path')
  const [incoming, setIncoming] = useState<EscalationRequest[]>([])
  const [mine, setMine] = useState<EscalationRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTriage, setActiveTriage] = useState<EscalationRequest | null>(null)

  // Manual re-fetch (dipanggil dari event handler onUpdated — bukan dari effect,
  // jadi setLoading sinkron di sini aman).
  const refresh = () => {
    if (!enabled) return
    setLoading(true)
    Promise.all([
      api.get<{ data: EscalationRequest[] }>('/escalations?filter=incoming'),
      api.get<{ data: EscalationRequest[] }>('/escalations?filter=mine'),
    ]).then(([a, b]) => {
      setIncoming(a.data)
      setMine(b.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  // Initial load — setState hanya di callback async (.then/.catch), jadi tak
  // ada setState sinkron dalam body effect (hindari cascading-render lint).
  useEffect(() => {
    if (!enabled) return
    let alive = true
    Promise.all([
      api.get<{ data: EscalationRequest[] }>('/escalations?filter=incoming'),
      api.get<{ data: EscalationRequest[] }>('/escalations?filter=mine'),
    ]).then(([a, b]) => {
      if (!alive) return
      setIncoming(a.data)
      setMine(b.data)
      setLoading(false)
    }).catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [enabled])

  if (!enabled) return null

  const incomingPending = incoming.filter(e => e.status === 'REQUESTED')
  const mineActive = mine.filter(e => !['CLEARED', 'DECLINED'].includes(e.status))

  return (
    <>
      <div data-tour="escalation-incoming">
        <CollapsibleSection
          title="My Clear the Path Requests"
          count={incomingPending.length}
          defaultOpen
          persistKey="inbox.escalation-incoming"
        >
          {loading && incoming.length === 0 ? (
            <div style={{ padding: '8px 0', fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>
          ) : incomingPending.length === 0 ? (
            <div style={{ padding: '12px', fontSize: 13, color: 'var(--text-muted)' }}>
              No pending requests. Your team is running smoothly — nice.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {incomingPending.map(req => (
                <EscalationRowButton key={req.id} request={req} onClick={() => setActiveTriage(req)} />
              ))}
            </div>
          )}
        </CollapsibleSection>
      </div>

      <div data-tour="escalation-mine">
        <CollapsibleSection
          title="Escalations I Raised"
          count={mineActive.length}
          defaultOpen={false}
          persistKey="inbox.escalation-mine"
        >
          {loading && mine.length === 0 ? (
            <div style={{ padding: '8px 0', fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>
          ) : mineActive.length === 0 ? (
            <div style={{ padding: '12px', fontSize: 13, color: 'var(--text-muted)' }}>
              No active escalations from you.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {mineActive.map(req => (
                <EscalationRowButton key={req.id} request={req} onClick={() => setActiveTriage(req)} showStatus />
              ))}
            </div>
          )}
        </CollapsibleSection>
      </div>

      {activeTriage && (
        <EscalationTriagePanel
          request={activeTriage}
          currentUserId={currentUserId}
          onClose={() => setActiveTriage(null)}
          onUpdated={(next) => {
            setActiveTriage(next)
            refresh()
          }}
        />
      )}
    </>
  )
}

function EscalationRowButton({
  request, onClick, showStatus,
}: {
  request: EscalationRequest
  onClick: () => void
  showStatus?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
        border: '1px solid var(--panel-border)', borderRadius: 8, background: 'var(--panel)',
        cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'var(--text)',
      }}
    >
      <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{request.title}</span>
      {showStatus && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {request.status === 'REQUESTED' ? 'Awaiting' :
           request.status === 'COMMITTED' ? 'Committed' :
           request.status === 'IN_PROGRESS' ? 'In Progress' :
           request.status === 'REROUTED' ? 'Rerouted' : request.status}
        </span>
      )}
      <AgingIndicator days={request.agingDays} showText />
    </button>
  )
}
