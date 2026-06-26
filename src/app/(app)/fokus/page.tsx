import { requireUser } from '@/lib/auth'
import ComingSoon from '@/components/ComingSoon'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Focus · ATLAS' }

export default async function FokusPage() {
  await requireUser()
  return <ComingSoon title="Focus" phpRoute="/fokus" />
}
