import { Head } from '@inertiajs/react'
import { useWorkspace } from '../hooks/useWorkspace'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { SectionState } from '../components/ui'
import { PageHeader } from '../design-system'
import { ActionPanel, actionPanelTitleFor } from '../components/ActionPanel'
import { EscalationSections } from '../components/EscalationSections'
import { CommitmentTodaySection } from '../components/CommitmentTodaySection'
import './FokusView.css'

/* ─── Focus (InboxView) ──────────────────────────────────────────────────
 * Port halaman /fokus dari atlas live. Live menampilkan dua bagian utama:
 *   1. "Needs Your Action" — program-level decisions (programSummary.needsAction)
 *   2. "My Clear the Path Requests" — eskalasi yg user ajukan
 * Bagian #1 (konten dominan) di-port penuh dgn data nyata via useWorkspace.
 * Bagian eskalasi + ranked focus buckets (Now/Today/Can Wait) butuh endpoint
 * (/escalations, /inbox/today, notification pipeline) yang belum diport —
 * menyusul. Buckets tsb kosong di live untuk user saat ini. */

export default function FokusView() {
  const { currentUser, programSummary, overviewStatus, openProgramWorkspace } = useWorkspace()
  const navigate = useInertiaNavigate()

  if (overviewStatus.loading && !programSummary) {
    return (
      <div className="ds fokus-v2 view-inbox">
        <div className="fokus-v2__inner ds-stagger">
          <PageHeader title="Focus" subtitle="Today's priority commitments & notifications" />
          <div className="fokus-page">
            <div className="fokus-zero" aria-busy="true">
              <p className="fokus-zero__sub">Loading…</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!programSummary) {
    return (
      <div className="ds fokus-v2 view-inbox">
        <div className="fokus-v2__inner">
          <PageHeader title="Focus" subtitle="Today's priority commitments & notifications" />
          <SectionState
            title="Focus data unavailable"
            text="Couldn't load your action queue. Try refreshing — if it persists, check the server connection."
          />
        </div>
      </div>
    )
  }

  const needsAction = Array.isArray(programSummary.needsAction) ? programSummary.needsAction : []

  return (
    <>
      <Head title="Focus" />
      <div className="ds fokus-v2 view-inbox">
        <div className="fokus-v2__inner ds-stagger">
          <PageHeader
            title="Focus"
            subtitle="Today's priority commitments & notifications"
          />

          <div className="fokus-page">
            {/* ── Today's Commitments (data-driven dari /inbox/today) ── */}
            <CommitmentTodaySection />

            {/* ── Clear the Path — escalation sections (pilot via feature flag) ── */}
            {currentUser?.id != null && <EscalationSections currentUserId={currentUser.id} />}

            {/* ── Needs Your Action — program-level decisions ── */}
            {needsAction.length > 0 && (
              <ActionPanel
                items={needsAction}
                onOpen={openProgramWorkspace}
                title={actionPanelTitleFor(programSummary.scope)}
              />
            )}

            {/* ── Empty state — antrian bersih ── */}
            {needsAction.length === 0 && (
              <div className="fokus-zero">
                <div className="fokus-zero__check" aria-hidden="true">✓</div>
                <p className="fokus-zero__title">Your queue is clear</p>
                <p className="fokus-zero__sub">
                  Nothing to handle right now. Take a break or check{' '}
                  <button type="button" className="fokus-zero__link" onClick={() => navigate('/')}>Home</button>{' '}
                  for the {currentUser ? 'division' : 'portfolio'} overview.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
