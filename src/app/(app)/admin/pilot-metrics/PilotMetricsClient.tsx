'use client'

import { PageProvider } from '@/lib/inertia-compat'
import AdminPilotMetricsView from '@/views/AdminPilotMetricsView'

export default function PilotMetricsClient({ props }: { props: Record<string, unknown> }) {
  return (
    <PageProvider props={props}>
      <AdminPilotMetricsView />
    </PageProvider>
  )
}
