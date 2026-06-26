import { requireUser } from '@/lib/auth'
import ComingSoon from '@/components/ComingSoon'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Pilot Metrics · ATLAS' }

export default async function AdminPilotMetricsPage() {
  await requireUser()
  return <ComingSoon title="Pilot Metrics" phpRoute="/admin/pilot-metrics" />
}
