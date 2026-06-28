'use client'

import { PageProvider } from '@/lib/inertia-compat'
import IndividuDetailView from '@/views/IndividuDetailView'

export default function IndividuDetailClient({ props }: { props: Record<string, unknown> }) {
  return (
    <PageProvider props={props}>
      <IndividuDetailView />
    </PageProvider>
  )
}
