'use client'

import { PageProvider } from '@/lib/inertia-compat'
import { WorkspaceProvider } from '@/contexts/workspace'
import { AdminUsersView } from '@/views/AdminUsersView'

export default function AdminUsersClient({ props }: { props: Record<string, unknown> }) {
  return (
    <PageProvider props={props}>
      <WorkspaceProvider>
        <AdminUsersView />
      </WorkspaceProvider>
    </PageProvider>
  )
}
