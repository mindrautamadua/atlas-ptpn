import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { buildSharedProps } from '@/lib/shared-props'
import { divisiComparisonData, divisiSingleData, divisiShouldRedirectToScorecard } from '@/lib/divisi'
import DivisiClient from './DivisiClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Division KPI · ATLAS' }

export default async function PerformanceDivisiPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>
}) {
  const user = await requireUser()
  const { periode } = await searchParams

  // DIRUT/eksekutif → scorecard; BOD fungsional → comparison; lainnya → single default.
  if (await divisiShouldRedirectToScorecard(user)) {
    redirect(`/performance/scorecard${periode ? `?periode=${periode}` : ''}`)
  }

  const isBod = (user.roleType ?? '').toUpperCase() === 'BOD'
  const data = isBod
    ? await divisiComparisonData(user, periode)
    : await divisiSingleData(user, undefined, periode)
  const props = { ...buildSharedProps(user), ...data }
  return <DivisiClient props={props} />
}
