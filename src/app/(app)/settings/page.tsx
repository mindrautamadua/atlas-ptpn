import { requireUser } from '@/lib/auth'
import { buildSharedProps } from '@/lib/shared-props'
import SettingsClient from './SettingsClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Settings · ATLAS' }

export default async function SettingsPage() {
  const user = await requireUser()
  const props = buildSharedProps(user)
  return <SettingsClient props={props} />
}
