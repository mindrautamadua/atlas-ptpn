'use client'

/**
 * Inertia → Next.js compatibility shim.
 *
 * `@inertiajs/react` di-alias ke modul ini (lihat tsconfig paths + next.config),
 * sehingga komponen view (HomeView, ProgramsView, …) bisa dipakai VERBATIM —
 * `import { usePage, router, Head } from '@inertiajs/react'` tetap jalan.
 *
 * Shared props (auth, flash, features, thresholds, …) + page props disuplai
 * server component via <PageProvider>.
 */

import {
  createContext, useContext, useEffect, useRef, type ReactNode,
} from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import NextLink from 'next/link'

// ── Page props context ──────────────────────────────────────────────────────
type AnyProps = Record<string, unknown>
const PagePropsContext = createContext<{ props: AnyProps; url: string }>({ props: {}, url: '/' })

export function PageProvider({ props, children }: { props: AnyProps; children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // Bridge Next router into the module singleton so `router.visit()` works.
  useEffect(() => {
    nextNav.push = (url: string) => router.push(url)
    nextNav.replace = (url: string) => router.replace(url)
    nextNav.refresh = () => router.refresh()
  }, [router])
  // Inertia's usePage().url includes the query string — mirror that so views
  // that parse `url.split('?')[1]` (ProgramsView filters) work.
  const qs = searchParams?.toString()
  const url = qs ? `${pathname}?${qs}` : pathname
  return (
    <PagePropsContext.Provider value={{ props, url }}>
      {children}
    </PagePropsContext.Provider>
  )
}

export function usePage<T = AnyProps>(): { props: T; url: string; component: string; version: string } {
  const ctx = useContext(PagePropsContext)
  return { props: ctx.props as T, url: ctx.url, component: '', version: '' }
}

// ── router singleton ─────────────────────────────────────────────────────────
const nextNav: { push: (url: string) => void; replace: (url: string) => void; refresh: () => void } = {
  push: (url) => { if (typeof window !== 'undefined') window.location.assign(url) },
  replace: (url) => { if (typeof window !== 'undefined') window.location.replace(url) },
  refresh: () => { if (typeof window !== 'undefined') window.location.reload() },
}

type VisitOptions = {
  method?: 'get' | 'post' | 'put' | 'patch' | 'delete'
  data?: unknown
  preserveScroll?: boolean
  preserveState?: boolean
  replace?: boolean
  only?: string[]
  onSuccess?: (page?: unknown) => void
  onError?: (errors?: unknown) => void
  onFinish?: () => void
}

async function request(url: string, method: string, data?: unknown, opts: VisitOptions = {}) {
  try {
    const res = await fetch(url, {
      method: method.toUpperCase(),
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
      body: method.toLowerCase() === 'get' ? undefined : JSON.stringify(data ?? {}),
      credentials: 'same-origin',
    })
    if (!res.ok) {
      let errors: unknown = undefined
      try { errors = await res.json() } catch { /* ignore */ }
      opts.onError?.(errors)
      return
    }
    let page: unknown = undefined
    try { page = await res.json() } catch { /* ignore */ }
    opts.onSuccess?.(page)
    nextNav.refresh()
  } catch (e) {
    opts.onError?.(e)
  } finally {
    opts.onFinish?.()
  }
}

type Listener = (event: { detail?: unknown }) => void
const listeners: Record<string, Set<Listener>> = {}

export const router = {
  visit(url: string, opts: VisitOptions = {}) {
    const method = opts.method ?? 'get'
    if (method === 'get') { opts.replace ? nextNav.replace(url) : nextNav.push(url); return }
    void request(url, method, opts.data, opts)
  },
  get(url: string, data?: unknown, opts: VisitOptions = {}) {
    nextNav.push(url + (data ? `?${new URLSearchParams(data as Record<string, string>)}` : ''))
    opts.onFinish?.()
  },
  post(url: string, data?: unknown, opts: VisitOptions = {}) { void request(url, 'post', data, opts) },
  put(url: string, data?: unknown, opts: VisitOptions = {}) { void request(url, 'put', data, opts) },
  patch(url: string, data?: unknown, opts: VisitOptions = {}) { void request(url, 'patch', data, opts) },
  delete(url: string, opts: VisitOptions = {}) { void request(url, 'delete', undefined, opts) },
  reload(opts: VisitOptions = {}) { nextNav.refresh(); opts.onFinish?.() },
  on(event: string, cb: Listener) {
    ;(listeners[event] ??= new Set()).add(cb)
    return () => listeners[event]?.delete(cb)
  },
}

// ── <Head> ────────────────────────────────────────────────────────────────────
export function Head({ title, children }: { title?: string; children?: ReactNode }) {
  const last = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (title && title !== last.current) {
      document.title = title.includes('ATLAS') ? title : `${title} · ATLAS`
      last.current = title
    }
  }, [title])
  return <>{children}</>
}

// ── <Link> ──────────────────────────────────────────────────────────────────
export function Link({ href, children, ...rest }: { href: string; children?: ReactNode } & Record<string, unknown>) {
  return <NextLink href={href} {...rest}>{children}</NextLink>
}

export function createInertiaApp() { /* no-op in Next */ }
