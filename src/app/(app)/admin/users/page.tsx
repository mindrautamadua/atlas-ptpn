import { requireUser } from '@/lib/auth'
import ComingSoon from '@/components/ComingSoon'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Users · ATLAS' }

export default async function AdminUsersPage() {
  await requireUser()
  return <ComingSoon title="Users" phpRoute="/admin/users" />
}
