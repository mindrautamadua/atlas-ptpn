'use client'

import { PageProvider } from '@/lib/inertia-compat'
import ScorecardView from '@/views/ScorecardView'

export default function ScorecardClient({ props }: { props: Record<string, unknown> }) {
  return (
    <PageProvider props={props}>
      <ScorecardView />
    </PageProvider>
  )
}
