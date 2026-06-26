import { requireUser } from '@/lib/auth'
import ComingSoon from '@/components/ComingSoon'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Thresholds · ATLAS' }

export default async function AdminThresholdsPage() {
  await requireUser()
  return <ComingSoon title="Thresholds" phpRoute="/admin/thresholds" />
}
