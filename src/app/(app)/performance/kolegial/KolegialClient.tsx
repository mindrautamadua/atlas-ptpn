'use client'

import { PageProvider } from '@/lib/inertia-compat'
import KolegialView from '@/views/KolegialView'

export default function KolegialClient({ props }: { props: Record<string, unknown> }) {
  return (
    <PageProvider props={props}>
      <KolegialView />
    </PageProvider>
  )
}
