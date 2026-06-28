import { requireUser } from '@/lib/auth'
import { buildSharedProps } from '@/lib/shared-props'
import { individuDetailData } from '@/lib/individu'
import IndividuDetailClient from './IndividuDetailClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'My KPI · ATLAS' }

export default async function PerformanceIndividuDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ periode?: string }>
}) {
  const user = await requireUser()
  const { id } = await params
  const { periode } = await searchParams
  const data = await individuDetailData(id, periode)
  const props = { ...buildSharedProps(user), ...data }
  return <IndividuDetailClient props={props} />
}
