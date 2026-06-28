import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { buildSharedProps } from '@/lib/shared-props'
import { thresholdsData } from '@/lib/thresholds'
import AdminThresholdsClient from './AdminThresholdsClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Thresholds · ATLAS' }

export default async function AdminThresholdsPage() {
  const user = await requireUser()
  // Mirror ensureSuperAdmin — superadmin only.
  if ((user.roleType ?? '').toUpperCase() !== 'SUPERADMIN') redirect('/')

  const data = await thresholdsData()
  const props = { ...buildSharedProps(user), ...data }
  return <AdminThresholdsClient props={props} />
}
