'use client'

import { PageProvider } from '@/lib/inertia-compat'
import { PlaybookView } from '@/views/PlaybookView'

export default function PlaybookClient({ props }: { props: Record<string, unknown> }) {
  return (
    <PageProvider props={props}>
      <PlaybookView />
    </PageProvider>
  )
}
