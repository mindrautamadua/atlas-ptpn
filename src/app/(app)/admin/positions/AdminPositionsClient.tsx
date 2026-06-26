'use client'

import { PageProvider } from '@/lib/inertia-compat'
import { WorkspaceProvider } from '@/contexts/workspace'
import { AdminPositionsView } from '@/views/AdminPositionsView'

export default function AdminPositionsClient({ props }: { props: Record<string, unknown> }) {
  return (
    <PageProvider props={props}>
      <WorkspaceProvider>
        <AdminPositionsView />
      </WorkspaceProvider>
    </PageProvider>
  )
}
