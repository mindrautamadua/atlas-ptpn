import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { buildSharedProps } from '@/lib/shared-props'
import { computePilotMetrics, pilotCriteria } from '@/lib/pilot-metrics'
import PilotMetricsClient from './PilotMetricsClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Pilot Metrics · ATLAS' }

const CAN = new Set(['ADMIN', 'SUPERADMIN'])

export default async function AdminPilotMetricsPage() {
  const user = await requireUser()
  if (!CAN.has((user.roleType ?? '').toUpperCase())) redirect('/')

  const [metrics, criteria] = await Promise.all([computePilotMetrics(), pilotCriteria()])
  const props = { ...buildSharedProps(user), metrics, criteria }
  return <PilotMetricsClient props={props} />
}
