import { requireUser } from '@/lib/auth'
import ComingSoon from '@/components/ComingSoon'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'My KPI · ATLAS' }

export default async function PerformanceMePage() {
  await requireUser()
  return <ComingSoon title="My KPI" phpRoute="/performance/me" />
}
