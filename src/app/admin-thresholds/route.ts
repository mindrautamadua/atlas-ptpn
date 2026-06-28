import { NextRequest, NextResponse } from 'next/server'
import { withUser, abort, abortValidation } from '@/lib/http-route'
import { setThreshold, validThresholdKeys } from '@/lib/thresholds'

export const dynamic = 'force-dynamic'

/** Port AdminThresholdsController::update — PATCH /admin-thresholds (superadmin). */
export async function PATCH(req: NextRequest) {
  return withUser(async (user) => {
    if ((user.roleType ?? '').toUpperCase() !== 'SUPERADMIN') abort(403, 'Superadmin only.')
    const body = await req.json().catch(() => ({}))
    const errors: Record<string, string[]> = {}
    const key = typeof body.key === 'string' ? body.key : ''
    const category = typeof body.category === 'string' ? body.category : ''
    if (!key) errors.key = ['The key field is required.']
    if (body.value === undefined || body.value === null || body.value === '') errors.value = ['The value field is required.']
    if (!category) errors.category = ['The category field is required.']
    const description = typeof body.description === 'string' ? body.description : null
    if (Object.keys(errors).length) abortValidation(errors)
    if (!validThresholdKeys().has(key)) abort(422, `Unknown key: ${key}`)

    const row = await setThreshold(key, body.value, category, user.id, description)
    return NextResponse.json({ data: row })
  })
}
