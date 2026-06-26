import { requireUser } from '@/lib/auth'
import ComingSoon from '@/components/ComingSoon'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Leaderboard · ATLAS' }

export default async function PerformanceIndividuPage() {
  await requireUser()
  return <ComingSoon title="Leaderboard" phpRoute="/performance/individu" />
}
