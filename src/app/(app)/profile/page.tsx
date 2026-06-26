import { requireUser } from '@/lib/auth'
import ComingSoon from '@/components/ComingSoon'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Profile · ATLAS' }

export default async function ProfilePage() {
  await requireUser()
  return <ComingSoon title="Profile" phpRoute="/profile" />
}
