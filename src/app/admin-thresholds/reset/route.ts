import { NextRequest, NextResponse } from 'next/server'
import { withUser, abort, abortValidation } from '@/lib/http-route'
import { resetThreshold } from '@/lib/thresholds'

export const dynamic = 'force-dynamic'

/** Port AdminThresholdsController::reset — POST /admin-thresholds/reset (superadmin). */
export async function POST(req: NextRequest) {
  return withUser(async (user) => {
    if ((user.roleType ?? '').toUpperCase() !== 'SUPERADMIN') abort(403, 'Superadmin only.')
    const body = await req.json().catch(() => ({}))
    const key = typeof body.key === 'string' ? body.key : ''
    if (!key) abortValidation({ key: ['The key field is required.'] })
    await resetThreshold(key)
    return NextResponse.json({ ok: true })
  })
}
