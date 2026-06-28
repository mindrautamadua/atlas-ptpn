'use client'

import { PageProvider } from '@/lib/inertia-compat'
import DivisiView from '@/views/DivisiView'

export default function DivisiClient({ props }: { props: Record<string, unknown> }) {
  return (
    <PageProvider props={props}>
      <DivisiView />
    </PageProvider>
  )
}
