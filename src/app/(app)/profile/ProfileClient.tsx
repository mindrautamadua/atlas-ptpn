'use client'

import { PageProvider } from '@/lib/inertia-compat'
import { WorkspaceProvider } from '@/contexts/workspace'
import { ProfileView } from '@/views/ProfileView'

export default function ProfileClient({ props }: { props: Record<string, unknown> }) {
  return (
    <PageProvider props={props}>
      <WorkspaceProvider>
        <ProfileView />
      </WorkspaceProvider>
    </PageProvider>
  )
}
