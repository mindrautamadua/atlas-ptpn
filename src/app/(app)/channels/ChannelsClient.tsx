'use client'

import { PageProvider } from '@/lib/inertia-compat'
import { RealtimeProvider } from '@/contexts/RealtimeProvider'
import { WorkspaceProvider } from '@/contexts/workspace'
import { ChannelsViewWrapper } from '@/views/ChannelsViewWrapper'

export default function ChannelsClient({ props }: { props: Record<string, unknown> }) {
  return (
    <PageProvider props={props}>
      <RealtimeProvider>
        <WorkspaceProvider>
          <ChannelsViewWrapper />
        </WorkspaceProvider>
      </RealtimeProvider>
    </PageProvider>
  )
}
