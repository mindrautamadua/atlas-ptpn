import { requireUser } from '@/lib/auth'
import ComingSoon from '@/components/ComingSoon'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Roles · ATLAS' }

export default async function AdminRolesPage() {
  await requireUser()
  return <ComingSoon title="Roles" phpRoute="/admin/roles" />
}
