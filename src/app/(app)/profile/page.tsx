import { requireUser } from '@/lib/auth'
import { buildSharedProps } from '@/lib/shared-props'
import ProfileClient from './ProfileClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Profile · ATLAS' }

export default async function ProfilePage() {
  const user = await requireUser()
  const props = buildSharedProps(user)
  return <ProfileClient props={props} />
}
