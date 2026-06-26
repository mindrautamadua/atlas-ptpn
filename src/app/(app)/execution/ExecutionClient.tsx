'use client'

import { PageProvider } from '@/lib/inertia-compat'
import { WorkspaceProvider } from '@/contexts/workspace'
import { WorkboardView } from '@/views/WorkboardView'

export default function ExecutionClient({ props }: { props: Record<string, unknown> }) {
  return (
    <PageProvider props={props}>
      <WorkspaceProvider>
        <WorkboardView />
      </WorkspaceProvider>
    </PageProvider>
  )
}
