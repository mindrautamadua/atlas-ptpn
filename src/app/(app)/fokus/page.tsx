import { requireUser } from '@/lib/auth'
import { buildSharedProps } from '@/lib/shared-props'
import FokusClient from './FokusClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Focus · ATLAS' }

export default async function FokusPage() {
  const user = await requireUser()
  const props = buildSharedProps(user)
  return <FokusClient props={props} />
}
