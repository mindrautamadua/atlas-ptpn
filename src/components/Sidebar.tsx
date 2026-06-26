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

/** Light/dark toggle — bottom-left, mirror tombol tema di atlas-php sidebar. */
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
      className="atlas-sidebar__theme-toggle"
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  )
}

export default function Sidebar({ user, programCount = 0 }: { user: AuthUser; programCount?: number }) {
  const active = normalizeNavPath(usePathname())
  const groups = buildGroups(user, programCount)

  return (
    <aside className="atlas-sidebar">
      <div className="atlas-sidebar__brand">
        <span className="atlas-sidebar__mark">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
            <line x1="2.5" y1="18.5" x2="10" y2="2.5" />
            <line x1="17.5" y1="18.5" x2="10" y2="2.5" />
            <line x1="6.3" y1="11.5" x2="13.7" y2="11.5" />
          </svg>
        </span>
        <span className="atlas-sidebar__wordmark-block">
          <span className="atlas-sidebar__wordmark">ATLAS</span>
          <span className="atlas-sidebar__tagline">PTPN III · Holding</span>
        </span>
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

      <div className="atlas-sidebar__footer">
        <ThemeToggle />
      </div>
    </aside>
  )
}
