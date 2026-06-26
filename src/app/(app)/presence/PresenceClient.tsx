'use client'

import { PageProvider } from '@/lib/inertia-compat'
import { WorkspaceProvider } from '@/contexts/workspace'
import { PresenceView } from '@/views/PresenceView'

export default function PresenceClient({ props }: { props: Record<string, unknown> }) {
  return (
    <PageProvider props={props}>
      <WorkspaceProvider>
        <PresenceView />
      </WorkspaceProvider>
    </PageProvider>
  )
}
