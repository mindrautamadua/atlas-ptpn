'use client'

import { PageProvider } from '@/lib/inertia-compat'
import { WorkspaceProvider } from '@/contexts/workspace'
import FokusView from '@/views/FokusView'

export default function FokusClient({ props }: { props: Record<string, unknown> }) {
  return (
    <PageProvider props={props}>
      <WorkspaceProvider>
        <FokusView />
      </WorkspaceProvider>
    </PageProvider>
  )
}
