'use client'

import { PageProvider } from '@/lib/inertia-compat'
import IndividuView from '@/views/IndividuView'

export default function IndividuClient({ props }: { props: Record<string, unknown> }) {
  return (
    <PageProvider props={props}>
      <IndividuView />
    </PageProvider>
  )
}
