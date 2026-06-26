import { requireUser } from '@/lib/auth'
import { buildSharedProps } from '@/lib/shared-props'
import JadwalClient from './JadwalClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Coordination · ATLAS' }

export default async function JadwalPage() {
  const user = await requireUser()
  const props = buildSharedProps(user)
  return <JadwalClient props={props} />
}
