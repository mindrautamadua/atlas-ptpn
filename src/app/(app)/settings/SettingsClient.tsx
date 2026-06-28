'use client'

import dynamic from 'next/dynamic'
import { PageProvider } from '@/lib/inertia-compat'
import { WorkspaceProvider } from '@/contexts/workspace'

// SettingsView membaca localStorage/document di initializer state → skip SSR
// (client-only) supaya tidak crash saat server render.
const SettingsView = dynamic(() => import('@/views/SettingsView').then((m) => m.SettingsView), { ssr: false })

export default function SettingsClient({ props }: { props: Record<string, unknown> }) {
  return (
    <PageProvider props={props}>
      <WorkspaceProvider>
        <SettingsView />
      </WorkspaceProvider>
    </PageProvider>
  )
}
