'use client'

import { PageProvider } from '@/lib/inertia-compat'
import { WorkspaceProvider } from '@/contexts/workspace'
import { ScheduleView } from '@/views/ScheduleView'

export default function JadwalClient({ props }: { props: Record<string, unknown> }) {
  return (
    <PageProvider props={props}>
      <WorkspaceProvider>
        <ScheduleView />
      </WorkspaceProvider>
    </PageProvider>
  )
}
