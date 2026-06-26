import { requireUser } from '@/lib/auth'
import { buildSharedProps } from '@/lib/shared-props'
import ProgramsClient from './ProgramsClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Programs · ATLAS' }

export default async function ProgramsPage() {
  const user = await requireUser()
  const props = buildSharedProps(user)
  return <ProgramsClient props={props} />
}
