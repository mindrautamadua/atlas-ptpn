import { requireUser } from '@/lib/auth'
import { buildSharedProps } from '@/lib/shared-props'
import PlaybookClient from './PlaybookClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Playbook · ATLAS' }

export default async function PlaybookPage() {
  const user = await requireUser()
  const props = buildSharedProps(user)
  return <PlaybookClient props={props} />
}
