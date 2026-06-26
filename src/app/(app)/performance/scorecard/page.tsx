import { requireUser } from '@/lib/auth'
import ComingSoon from '@/components/ComingSoon'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Scorecard · ATLAS' }

export default async function PerformanceScorecardPage() {
  await requireUser()
  return <ComingSoon title="Scorecard" phpRoute="/performance/scorecard" />
}
