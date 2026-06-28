'use client'

import { PageProvider } from '@/lib/inertia-compat'
import ExecutiveSummaryView from '@/views/ExecutiveSummaryView'

export default function ExecutiveClient({ props }: { props: Record<string, unknown> }) {
  return (
    <PageProvider props={props}>
      <ExecutiveSummaryView />
    </PageProvider>
  )
}
