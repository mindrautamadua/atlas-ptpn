import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { buildSharedProps } from '@/lib/shared-props'
import { kolegialIndexData, kolegialRedirectSlug } from '@/lib/kolegial'
import KolegialClient from './KolegialClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Directorate KPI · ATLAS' }

export default async function PerformanceKolegialPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>
}) {
  const user = await requireUser()
  const { periode } = await searchParams

  // BOD non-eksekutif punya 1 direktorat → langsung ke detail-nya (mirror kolegial()).
  const slug = await kolegialRedirectSlug(user)
  if (slug) redirect(`/performance/kolegial/${slug}${periode ? `?periode=${periode}` : ''}`)

  const data = await kolegialIndexData(user, periode)
  const props = { ...buildSharedProps(user), ...data }
  return <KolegialClient props={props} />
}
