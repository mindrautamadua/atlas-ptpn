import { requireUser } from '@/lib/auth'
import { buildSharedProps } from '@/lib/shared-props'
import { homeScorecardSnapshot } from '@/lib/scorecard'
import HomeClient from './HomeClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Home · ATLAS' }

export default async function HomePage() {
  const user = await requireUser()
  const scorecardSnapshot = await homeScorecardSnapshot({
    id: user.id,
    roleType: user.roleType,
    unitId: user.unitId,
    directorateId: user.directorateId,
  })
  const props = { ...buildSharedProps(user), scorecardSnapshot }
  return <HomeClient props={props} />
}
