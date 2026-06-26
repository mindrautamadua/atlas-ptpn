import { requireUser } from '@/lib/auth'
import { buildSharedProps } from '@/lib/shared-props'
import AssignmentsClient from './AssignmentsClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Assignment · ATLAS' }

export default async function PenugasanPage() {
  const user = await requireUser()
  return <AssignmentsClient props={buildSharedProps(user)} />
}
