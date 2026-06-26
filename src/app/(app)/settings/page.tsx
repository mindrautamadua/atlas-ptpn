import { requireUser } from '@/lib/auth'
import ComingSoon from '@/components/ComingSoon'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Settings · ATLAS' }

export default async function SettingsPage() {
  await requireUser()
  return <ComingSoon title="Settings" phpRoute="/settings" />
}
