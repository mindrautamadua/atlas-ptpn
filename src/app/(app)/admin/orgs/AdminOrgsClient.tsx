'use client'

import { PageProvider } from '@/lib/inertia-compat'
import { WorkspaceProvider } from '@/contexts/workspace'
import { AdminOrgsView } from '@/views/AdminOrgsView'

export default function AdminOrgsClient({ props }: { props: Record<string, unknown> }) {
  return (
    <PageProvider props={props}>
      <WorkspaceProvider>
        <AdminOrgsView />
      </WorkspaceProvider>
    </PageProvider>
  )
}
