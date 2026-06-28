import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { buildSharedProps } from '@/lib/shared-props'
import AdminRolesClient from './AdminRolesClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Roles · ATLAS' }

const CAN_MANAGE = new Set(['ADMIN', 'SUPERADMIN'])

export default async function AdminRolesPage() {
  const user = await requireUser()
  if (!CAN_MANAGE.has((user.roleType ?? '').toUpperCase())) redirect('/')
  const props = buildSharedProps(user)
  return <AdminRolesClient props={props} />
}
