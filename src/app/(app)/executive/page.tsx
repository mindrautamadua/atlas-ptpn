import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { buildSharedProps } from '@/lib/shared-props'
import { executiveSummary } from '@/lib/executive'
import ExecutiveClient from './ExecutiveClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Executive Summary · ATLAS' }

const ALLOWED = new Set(['BOD', 'ADMIN', 'SUPERADMIN'])

export default async function ExecutivePage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>
}) {
  const user = await requireUser()
  // Mirror gate ExecutiveSummaryController: hanya BOD/ADMIN/SUPERADMIN.
  if (!ALLOWED.has((user.roleType ?? '').toUpperCase())) redirect('/')

  const { periode } = await searchParams
  const data = await executiveSummary(user, periode)
  const props = { ...buildSharedProps(user), ...data }
  return <ExecutiveClient props={props} />
}
