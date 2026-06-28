'use client'

import { PageProvider } from '@/lib/inertia-compat'
import KolegialDetailView from '@/views/KolegialDetailView'

export default function KolegialDetailClient({ props }: { props: Record<string, unknown> }) {
  return (
    <PageProvider props={props}>
      <KolegialDetailView />
    </PageProvider>
  )
}
