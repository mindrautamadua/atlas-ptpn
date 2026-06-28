'use client'

import { PageProvider } from '@/lib/inertia-compat'
import AdminThresholdsView from '@/views/AdminThresholdsView'

export default function AdminThresholdsClient({ props }: { props: Record<string, unknown> }) {
  return (
    <PageProvider props={props}>
      <AdminThresholdsView />
    </PageProvider>
  )
}
