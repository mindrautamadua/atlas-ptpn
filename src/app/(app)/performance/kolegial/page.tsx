import { requireUser } from '@/lib/auth'
import ComingSoon from '@/components/ComingSoon'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Directorate KPI · ATLAS' }

export default async function PerformanceKolegialPage() {
  await requireUser()
  return <ComingSoon title="Directorate KPI" phpRoute="/performance/kolegial" />
}
