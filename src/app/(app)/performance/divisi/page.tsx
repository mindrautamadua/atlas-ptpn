import { requireUser } from '@/lib/auth'
import ComingSoon from '@/components/ComingSoon'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Division KPI · ATLAS' }

export default async function PerformanceDivisiPage() {
  await requireUser()
  return <ComingSoon title="Division KPI" phpRoute="/performance/divisi" />
}
