import { requireUser } from '@/lib/auth'
import { buildSharedProps } from '@/lib/shared-props'
import AdminOrgsClient from './AdminOrgsClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Companies · ATLAS' }

export default async function AdminOrgsPage() {
  const user = await requireUser()
  const props = buildSharedProps(user)
  return <AdminOrgsClient props={props} />
}
