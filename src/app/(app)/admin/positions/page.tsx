import { requireUser } from '@/lib/auth'
import { buildSharedProps } from '@/lib/shared-props'
import AdminPositionsClient from './AdminPositionsClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Positions · ATLAS' }

export default async function AdminPositionsPage() {
  const user = await requireUser()
  const props = buildSharedProps(user)
  return <AdminPositionsClient props={props} />
}
