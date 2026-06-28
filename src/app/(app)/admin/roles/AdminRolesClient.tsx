'use client'

import { PageProvider } from '@/lib/inertia-compat'
import { WorkspaceProvider } from '@/contexts/workspace'
import { AdminRolesView } from '@/views/AdminRolesView'

export default function AdminRolesClient({ props }: { props: Record<string, unknown> }) {
  return (
    <PageProvider props={props}>
      <WorkspaceProvider>
        <AdminRolesView />
      </WorkspaceProvider>
    </PageProvider>
  )
}
