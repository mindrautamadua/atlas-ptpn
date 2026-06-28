import { requireUser } from '@/lib/auth'
import { buildSharedProps } from '@/lib/shared-props'
import { kolegialDetailData } from '@/lib/kolegial'
import KolegialDetailClient from './KolegialDetailClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Directorate KPI · ATLAS' }

export default async function KolegialDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ periode?: string }>
}) {
  const user = await requireUser()
  const { slug } = await params
  const { periode } = await searchParams
  const data = await kolegialDetailData(slug, periode)
  const props = { ...buildSharedProps(user), ...data }
  return <KolegialDetailClient props={props} />
}
