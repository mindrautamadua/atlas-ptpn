import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'My KPI · ATLAS' }

export default async function PerformanceMePage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>
}) {
  const user = await requireUser()
  const { periode } = await searchParams
  // Mirror PerformanceController::me — redirect ke detail individu user sendiri.
  redirect(`/performance/individu/${user.id}${periode ? `?periode=${periode}` : ''}`)
}
