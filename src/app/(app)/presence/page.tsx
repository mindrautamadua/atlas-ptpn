import { requireUser } from '@/lib/auth'
import { buildSharedProps } from '@/lib/shared-props'
import PresenceClient from './PresenceClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Presence · ATLAS' }

export default async function PresencePage() {
  const user = await requireUser()
  return <PresenceClient props={buildSharedProps(user)} />
}
