'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, Target, FolderKanban, LayoutGrid, ClipboardList,
  CalendarDays, MessagesSquare, CircleUser,
  FileText, Trophy, Network, PieChart, Gauge, Medal,
  Building2, Briefcase, Users, ShieldCheck, BarChart3, SlidersHorizontal,
  Moon, Sun, type LucideIcon,
} from 'lucide-react'
import { normalizeNavPath } from '@/lib/nav-config'
import type { AuthUser } from '@/lib/auth'

type Item = { path: string; label: string; icon: LucideIcon; badge?: number }
type Group = { label: string; items: Item[]; hideLabel?: boolean }

// Mirror NI map di atlas-php AppShell.tsx — single source untuk label + ikon.
const NI = {
  home:        { path: '/',                       label: 'Home',             icon: Home },
  fokus:       { path: '/fokus',                  label: 'Focus',            icon: Target },
  programs:    { path: '/programs',               label: 'Programs',         icon: FolderKanban },
  executive:   { path: '/executive',              label: 'Executive Summary', icon: FileText },
  perfScore:   { path: '/performance/scorecard',  label: 'Scorecard',        icon: Trophy },
  perfDir:     { path: '/performance/kolegial',   label: 'Directorate KPI',  icon: Network },
  perfDiv:     { path: '/performance/divisi',     label: 'Division KPI',     icon: PieChart },
  perfMe:      { path: '/performance/me',         label: 'My KPI',           icon: Gauge },
  perfIndiv:   { path: '/performance/individu',   label: 'Leaderboard',      icon: Medal },
  execution:   { path: '/execution',              label: 'Workboard',        icon: LayoutGrid },
  penugasan:   { path: '/penugasan',              label: 'Assignment',       icon: ClipboardList },
  schedule:    { path: '/jadwal',                 label: 'Coordination',     icon: CalendarDays },
  channels:    { path: '/channels',               label: 'Channels',         icon: MessagesSquare },
  presence:    { path: '/presence',               label: 'Presence',         icon: CircleUser },
} satisfies Record<string, Item>

const ADMIN_ROLES = new Set(['superadmin', 'admin'])

/** Bangun grup sidebar persis seperti AppShell.tsx (role-aware). */
function buildGroups(user: AuthUser, programCount: number): Group[] {
  const role = (user.roleType ?? '').toUpperCase()
  const isSuperAdmin = role === 'SUPERADMIN'
  const isAdmin = ADMIN_ROLES.has((user.roleType ?? '').toLowerCase())
  const canPerf = user.canAccessPerformance

  const programs: Item = { ...NI.programs, badge: programCount || undefined }
  const portfolioItems: Item[] = isSuperAdmin
    ? [programs, NI.executive, NI.perfScore, NI.perfDir, NI.perfDiv, NI.perfIndiv, NI.perfMe]
    : canPerf
      ? [programs, NI.perfScore, NI.perfDir, NI.perfDiv]
      : [programs]

  const groups: Group[] = [
    { label: 'Today', items: [NI.home, NI.fokus], hideLabel: true },
    {
      label: isSuperAdmin || canPerf ? 'Portfolio & Performance' : 'Portfolio',
      items: portfolioItems,
    },
    { label: 'Work', items: [NI.execution, NI.penugasan, NI.schedule, NI.channels, NI.presence] },
  ]

  if (isAdmin) {
    groups.push({
      label: 'Admin',
      items: [
        { path: '/admin/orgs',          label: 'Companies',     icon: Building2 },
        { path: '/admin/positions',     label: 'Positions',     icon: Briefcase },
        { path: '/admin/users',         label: 'Users',         icon: Users },
        { path: '/admin/roles',         label: 'Roles',         icon: ShieldCheck },
        { path: '/admin/pilot-metrics', label: 'Pilot Metrics', icon: BarChart3 },
        ...(isSuperAdmin
          ? [{ path: '/admin/thresholds', label: 'Thresholds', icon: SlidersHorizontal }]
          : []),
      ],
    })
  }

  return groups
}

/** Light/dark toggle — footer util button, mirror tombol tema di atlas live. */
function ThemeToggle() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const stored = localStorage.getItem('atlas-theme')
    const isDark = stored === 'dark'
    // One-time read of persisted theme on mount — unavailable during SSR, so it
    // can't be a render/lazy initializer. setState-in-effect is correct here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(isDark)
    document.documentElement.classList.toggle('dark', isDark)
  }, [])
  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('atlas-theme', next ? 'dark' : 'light')
  }
  return (
    <button
      type="button"
      className="atlas-sidebar__util-btn"
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}

/** Brand mark — triangle "A" glyph, mirror atlas live sidebar. */
function BrandMark() {
  return (
    <span className="atlas-sidebar__mark">
      <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <line x1="2.5" y1="18.5" x2="10" y2="2.5" />
        <line x1="17.5" y1="18.5" x2="10" y2="2.5" />
        <line x1="6.3" y1="11.5" x2="13.7" y2="11.5" />
      </svg>
    </span>
  )
}

/** Workspace chip — brand block as a menu trigger (ATLAS · Holding · directorate).
 *  Mirror sidebar__wschip di atlas live. Menu informatif: workspace + scope user. */
function WorkspaceChip({ user }: { user: AuthUser }) {
  const [open, setOpen] = useState(false)
  // Tagline dinamis: kode direktorat user (mis. "DIR-KMR"); fallback "Holding"
  // untuk portfolio/superadmin tanpa direktorat. Mirror tagline live.
  const dirCode = user.directorate?.code ?? 'Holding'
  return (
    <div className="atlas-sidebar__ws">
      <button
        type="button"
        className="atlas-sidebar__brand atlas-sidebar__wschip"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Workspace menu"
        title="Workspace"
        onClick={() => setOpen((o) => !o)}
      >
        <BrandMark />
        <span className="atlas-sidebar__wordmark-block">
          <span className="atlas-sidebar__titlerow">
            <span className="atlas-sidebar__wordmark">ATLAS</span>
            <span className="atlas-sidebar__brand-chip">Holding</span>
          </span>
          <span className="atlas-sidebar__tagline">PTPN III · {dirCode}</span>
        </span>
        <span className="atlas-sidebar__brand-chev" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 5.5 7 8.5l3-3" />
          </svg>
        </span>
      </button>
      {open && (
        <>
          <div className="atlas-sidebar__ws-scrim" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="atlas-sidebar__ws-menu" role="menu">
            <div className="atlas-sidebar__ws-head">
              <span className="atlas-sidebar__ws-head-label">Workspace</span>
              <span className="atlas-sidebar__ws-head-name">PTPN III · Holding</span>
              {user.directorate ? (
                <span className="atlas-sidebar__ws-head-sub">{user.directorate.name}</span>
              ) : null}
            </div>
            <Link href="/profile" role="menuitem" className="atlas-sidebar__ws-item" onClick={() => setOpen(false)}>
              <CircleUser size={15} /> Your profile
            </Link>
            <Link href="/settings" role="menuitem" className="atlas-sidebar__ws-item" onClick={() => setOpen(false)}>
              <SlidersHorizontal size={15} /> Settings
            </Link>
          </div>
        </>
      )}
    </div>
  )
}

/** Action anchor — footer status card (mirror sidebar__anchor di atlas live).
 *  `count` = inbox AKSI PRIBADI user (Focus): approval yang menunggu keputusan
 *  user, mention, item ditugaskan — BUKAN needsAction direktorat-wide (itu kartu
 *  "Needs Your Decision" di Home). Di live, anchor ini "All clear" untuk direktur
 *  BOD walau decision-inbox direktorat berisi — karena dia bukan approver-nya.
 *
 *  Sumber count pribadi belum tersedia: halaman /fokus masih stub (ComingSoon),
 *  jadi default 0 → "All clear" (sesuai keadaan live untuk user ini). Saat Focus
 *  diport, teruskan count pribadi ke prop ini agar varian alert aktif. */
function ActionAnchor({ count = 0 }: { count?: number }) {
  const hasAction = count > 0
  if (hasAction) {
    return (
      <Link href="/fokus" className="atlas-sidebar__anchor atlas-sidebar__anchor--alert" aria-label={`${count} need your action — open Focus`}>
        <div className="atlas-sidebar__anchor-row">
          <span className="atlas-sidebar__anchor-icon" data-tone="amber" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3 L22 20 L2 20 Z" /><line x1="12" y1="10" x2="12" y2="14" /><circle cx="12" cy="17" r="0.6" fill="currentColor" />
            </svg>
          </span>
          <div className="atlas-sidebar__anchor-copy">
            <strong>{count} need your action</strong>
            <span>Approvals, escalations & support</span>
          </div>
        </div>
      </Link>
    )
  }
  return (
    <Link href="/fokus" className="atlas-sidebar__anchor atlas-sidebar__anchor--clear" aria-label="Nothing waiting — open Focus">
      <div className="atlas-sidebar__anchor-row">
        <span className="atlas-sidebar__anchor-icon" data-tone="green" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </span>
        <div className="atlas-sidebar__anchor-copy">
          <strong>All clear</strong>
          <span>Nothing needs your action</span>
        </div>
      </div>
    </Link>
  )
}

export default function Sidebar({ user, programCount = 0 }: { user: AuthUser; programCount?: number }) {
  const active = normalizeNavPath(usePathname())
  const groups = buildGroups(user, programCount)

  return (
    <aside className="atlas-sidebar">
      <div className="atlas-sidebar__header">
        <WorkspaceChip user={user} />
      </div>

      <nav className="atlas-sidebar__nav">
        {groups.map((group) => (
          <div key={group.label}>
            {group.hideLabel ? null : (
              <div className="atlas-sidebar__group-label">{group.label}</div>
            )}
            {group.items.map((item) => {
              const Icon = item.icon
              const isActive = active === item.path
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`atlas-sidebar__link${isActive ? ' atlas-sidebar__link--active' : ''}`}
                >
                  <Icon />
                  <span className="atlas-sidebar__link-label">{item.label}</span>
                  {item.badge ? <span className="atlas-sidebar__badge">{item.badge}</span> : null}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <ActionAnchor />

      <div className="atlas-sidebar__footer atlas-sidebar__footer--balanced">
        <Link
          href="/playbook"
          className="atlas-sidebar__util-btn"
          title="Playbook"
          aria-label="Playbook"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3.5 4.5A1.5 1.5 0 0 1 5 3h6v13H5a1.5 1.5 0 0 0-1.5 1.5Z" />
            <path d="M16.5 4.5A1.5 1.5 0 0 0 15 3h-4v13h4a1.5 1.5 0 0 1 1.5 1.5Z" />
          </svg>
        </Link>
        <Link
          href="/settings/notifications"
          className="atlas-sidebar__util-btn"
          title="Notifikasi"
          aria-label="Notifikasi"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 2.5a5 5 0 0 0-5 5c0 4-1.5 5.5-1.5 5.5h13S15 11.5 15 7.5a5 5 0 0 0-5-5Z" />
            <path d="M8.5 16.5a1.8 1.8 0 0 0 3 0" />
          </svg>
        </Link>
        <ThemeToggle />
      </div>
    </aside>
  )
}
