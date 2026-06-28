import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { buildSharedProps } from '@/lib/shared-props'
import AdminUsersClient from './AdminUsersClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Users · ATLAS' }

const CAN_MANAGE = new Set(['ADMIN', 'SUPERADMIN'])

export default async function AdminUsersPage() {
  const user = await requireUser()
  if (!CAN_MANAGE.has((user.roleType ?? '').toUpperCase())) redirect('/')
  const props = buildSharedProps(user)
  return <AdminUsersClient props={props} />
}
