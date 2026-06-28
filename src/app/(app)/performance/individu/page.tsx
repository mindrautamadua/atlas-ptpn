import { requireUser } from '@/lib/auth'
import { buildSharedProps } from '@/lib/shared-props'
import { individuData } from '@/lib/individu'
import IndividuClient from './IndividuClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Leaderboard · ATLAS' }

export default async function PerformanceIndividuPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>
}) {
  const user = await requireUser()
  const { periode } = await searchParams
  const data = await individuData(periode)
  const props = { ...buildSharedProps(user), ...data }
  return <IndividuClient props={props} />
}
