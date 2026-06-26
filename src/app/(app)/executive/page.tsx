import { requireUser } from '@/lib/auth'
import ComingSoon from '@/components/ComingSoon'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Executive Summary · ATLAS' }

export default async function ExecutivePage() {
  await requireUser()
  return <ComingSoon title="Executive Summary" phpRoute="/executive" />
}
