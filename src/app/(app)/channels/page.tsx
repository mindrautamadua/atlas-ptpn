import { requireUser } from '@/lib/auth'
import { buildSharedProps } from '@/lib/shared-props'
import ChannelsClient from './ChannelsClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Channels · ATLAS' }

export default async function ChannelsPage() {
  const user = await requireUser()
  const props = buildSharedProps(user)
  return <ChannelsClient props={props} />
}
