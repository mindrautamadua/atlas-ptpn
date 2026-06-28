import { requireUser } from '@/lib/auth'
import { buildSharedProps } from '@/lib/shared-props'
import { scorecardPageData } from '@/lib/scorecard'
import ScorecardClient from './ScorecardClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Scorecard · ATLAS' }

export default async function PerformanceScorecardPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>
}) {
  const user = await requireUser()
  const { periode } = await searchParams
  const data = await scorecardPageData(
    { id: user.id, roleType: user.roleType, unitId: user.unitId, directorateId: user.directorateId },
    periode,
  )
  const props = { ...buildSharedProps(user), ...data }
  return <ScorecardClient props={props} />
}
