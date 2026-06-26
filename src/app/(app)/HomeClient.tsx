'use client'

import { PageProvider } from '@/lib/inertia-compat'
import { WorkspaceProvider } from '@/contexts/workspace'
import HomeView from '@/views/HomeView'

export default function HomeClient({ props }: { props: Record<string, unknown> }) {
  return (
    <PageProvider props={props}>
      <WorkspaceProvider>
        <HomeView />
      </WorkspaceProvider>
    </PageProvider>
  )
}
