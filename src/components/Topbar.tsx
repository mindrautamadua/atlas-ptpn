'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { AuthUser } from '@/lib/auth'

/* Topbar — replicates the atlas-php AppShell.tsx `<header className="topbar">`
 * markup verbatim enough to reuse the legacy `.topbar*` CSS (extracted into
 * src/legacy-styles/topbar.css). Visual fidelity first; functionality is
 * minimal-but-not-broken:
 *   - Live indicator: static "Live" + computed period (Q · W · Month Year).
 *   - ⌘K search pill: visual only — NOT wired to a command palette yet (no-op).
 *   - Notifications bell: visual only — no feed/badge wired yet (minimal).
 *   - User menu: avatar + name + role, popover with Logout (POST /logout). */

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

/** Q · W-of-month · Month Year — mirrors the PHP AppShell topbar meta helper.
 * Computed at render (memoised once); rendered with suppressHydrationWarning
 * since server/client clocks can straddle a week/month boundary. */
function computePeriodLabel(): string {
  const now = new Date()
  const quarter = Math.floor(now.getMonth() / 3) + 1
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const firstISO = firstOfMonth.getDay() || 7 // Mon=1 … Sun=7
  const weekOfMonth = Math.ceil((now.getDate() + firstISO - 1) / 7)
  const monthName = now.toLocaleDateString('en-US', { month: 'long' })
  const monthLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1)
  return `Q${quarter} · W${weekOfMonth} ${monthLabel} ${now.getFullYear()}`
}

export default function Topbar({ user }: { user: AuthUser }) {
  const period = useMemo(() => computePeriodLabel(), [])
  const userInitials = useMemo(() => initials(user.name) || 'AU', [user.name])
  const roleLabel = user.unit?.name ?? user.positionTitle ?? user.roleType ?? ''

  const [menuOpen, setMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  // Close notif dropdown on outside click.
  useEffect(() => {
    if (!notifOpen) return
    const onDown = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [notifOpen])

  return (
    <header className="topbar">
      {/* Meta kiri: Live + periode ringkas (Q · W · tahun). Pure System —
          no breadcrumb (mirror atlas-php topbar). */}
      <div className="topbar__meta">
        <span
          className="topbar__live topbar__live--connected"
          title="Real-time active — data in sync"
        >
          <span className="topbar__live-dot" aria-hidden="true" />
          Live
        </span>
        <span className="topbar__meta-period" suppressHydrationWarning>{period}</span>
      </div>

      <div className="topbar__spacer" />

      {/* ⌘K command palette — prominent search pill. NOT wired to a palette yet. */}
      <button
        type="button"
        className="topbar__cmdk"
        aria-label="Search (⌘K)"
        title="Search (⌘K)"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="6" cy="6" r="4.5" />
          <path d="m9.5 9.5 3 3" />
        </svg>
        <span className="topbar__cmdk-placeholder">Search programs, tasks…</span>
        <kbd>⌘K</kbd>
      </button>

      {/* Right cluster */}
      <div className="topbar__right">
        {/* Notification bell — visual only, no feed wired yet. */}
        <div className="topbar__notif-menu" ref={notifRef}>
          <button
            aria-expanded={notifOpen}
            aria-haspopup="menu"
            className="topbar__notif-btn"
            onClick={() => setNotifOpen((o) => !o)}
            title="Notifications"
            type="button"
          >
            <svg className="topbar__notif-icon" fill="none" height="20" viewBox="0 0 20 20" width="20" aria-hidden="true">
              <path d="M10 3.2c-2.25 0-4.05 1.73-4.05 4.08v1.68c0 .78-.26 1.53-.74 2.14l-.68.85c-.3.37-.03.93.44.93h10.06c.47 0 .74-.56.44-.93l-.68-.85a3.42 3.42 0 0 1-.74-2.14V7.28c0-2.35-1.8-4.08-4.05-4.08Z" />
              <path d="M8.25 15.05c.3.76.95 1.25 1.75 1.25s1.45-.49 1.75-1.25" />
            </svg>
          </button>

          {notifOpen && (
            <div className="topbar__notif-popover" role="menu">
              <div className="topbar__notif-popover-head">
                <span className="topbar__notif-popover-title">Notifications</span>
              </div>
              <div className="topbar__notif-list">
                <div className="topbar__notif-empty">
                  <svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3, display: 'block', margin: '0 auto 8px' }}>
                    <path d="M8 1.5a5 5 0 0 1 5 5v2.5l1 1.5H1l1-1.5V6.5a5 5 0 0 1 5-5Z" />
                    <path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" />
                  </svg>
                  No notifications
                </div>
              </div>
              <div className="topbar__notif-footer">
                <Link
                  className="topbar__notif-view-all"
                  href="/fokus"
                  onClick={() => setNotifOpen(false)}
                >
                  View all in Focus →
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Help — visual only (no playbook route in Next yet). */}
        <button type="button" className="topbar__notif-btn" title="Help" aria-label="Help">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="10" cy="10" r="7.5" />
            <path d="M7.9 7.6a2.1 2.1 0 0 1 4.1.6c0 1.4-2 1.8-2 3" />
            <path d="M10 13.7h.01" />
          </svg>
        </button>

        {/* Account avatar + menu — kanan-atas. Popover with Logout. */}
        <div className="topbar__user-menu">
          <button
            className="topbar__avatar-btn"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            title={user.name}
            type="button"
          >
            <span className="topbar__avatar"><span className="topbar__avatar-initials">{userInitials}</span></span>
            <span className="topbar__avatar-name">{user.name}</span>
            <svg className="topbar__avatar-chev" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m3 4.5 3 3 3-3" />
            </svg>
          </button>

          {menuOpen && (
            <>
              <div className="topbar__menu-backdrop" onClick={() => setMenuOpen(false)} />
              <div className="topbar__user-popover" role="menu">
                <div className="topbar__user-popover-identity">
                  <div className="topbar__user-popover-avatar">{userInitials}</div>
                  <div>
                    <strong>{user.name}</strong>
                    {roleLabel ? <span>{roleLabel}</span> : null}
                  </div>
                </div>
                <div className="topbar__user-popover-divider" />
                <Link
                  className="topbar__user-popover-item"
                  href="/profile"
                  onClick={() => setMenuOpen(false)}
                  role="menuitem"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="7" cy="4.5" r="2.5" />
                    <path d="M2.5 12a4.5 4.5 0 0 1 9 0" />
                  </svg>
                  Profile
                </Link>
                <Link
                  className="topbar__user-popover-item"
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  role="menuitem"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.5 4.5h7M12 4.5h1.5" />
                    <circle cx="10.5" cy="4.5" r="1.5" />
                    <path d="M2.5 8h3M8 8h5.5" />
                    <circle cx="6.5" cy="8" r="1.5" />
                    <path d="M2.5 11.5h8M13 11.5h.5" />
                    <circle cx="11.5" cy="11.5" r="1.5" />
                  </svg>
                  Settings
                </Link>
                <div className="topbar__user-popover-divider" />
                <form action="/logout" method="post">
                  <button
                    className="topbar__user-popover-item topbar__user-popover-item--danger"
                    type="submit"
                    role="menuitem"
                    style={{ width: '100%' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 7h7M9.5 4.5 12 7l-2.5 2.5" />
                      <path d="M5 2H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2" />
                    </svg>
                    Sign out
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
