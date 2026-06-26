'use client'

import { PageProvider } from '@/lib/inertia-compat'
import { WorkspaceProvider } from '@/contexts/workspace'
import { ProgramsView } from '@/views/ProgramsView'

export default function ProgramsClient({ props }: { props: Record<string, unknown> }) {
  return (
    <PageProvider props={props}>
      <WorkspaceProvider>
        <ProgramsView />
      </WorkspaceProvider>
    </PageProvider>
  )
}
