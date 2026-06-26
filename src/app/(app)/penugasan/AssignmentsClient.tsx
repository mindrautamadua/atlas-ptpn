'use client'

import { PageProvider } from '@/lib/inertia-compat'
import { WorkspaceProvider } from '@/contexts/workspace'
import { AssignmentsView } from '@/views/AssignmentsView'

export default function AssignmentsClient({ props }: { props: Record<string, unknown> }) {
  return (
    <PageProvider props={props}>
      <WorkspaceProvider>
        <AssignmentsView />
      </WorkspaceProvider>
    </PageProvider>
  )
}
