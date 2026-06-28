import { requireUser } from '@/lib/auth'
import { buildSharedProps } from '@/lib/shared-props'
import { divisiSingleData } from '@/lib/divisi'
import DivisiClient from '../DivisiClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Division KPI · ATLAS' }

export default async function PerformanceDivisiDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ kode: string }>
  searchParams: Promise<{ periode?: string }>
}) {
  const user = await requireUser()
  const { kode } = await params
  const { periode } = await searchParams
  const data = await divisiSingleData(user, kode, periode)
  const props = { ...buildSharedProps(user), ...data }
  return <DivisiClient props={props} />
}
