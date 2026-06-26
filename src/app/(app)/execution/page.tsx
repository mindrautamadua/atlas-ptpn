import { requireUser } from '@/lib/auth'
import { buildSharedProps } from '@/lib/shared-props'
import ExecutionClient from './ExecutionClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Workboard · ATLAS' }

export default async function ExecutionPage() {
  const user = await requireUser()
  const props = buildSharedProps(user)
  return <ExecutionClient props={props} />
}
