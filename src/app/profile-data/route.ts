import { NextRequest, NextResponse } from 'next/server'
import { withUser, abort, abortValidation } from '@/lib/http-route'
import { profileData, updateProfile } from '@/lib/profile'

export const dynamic = 'force-dynamic'

/** Port WorkspaceController::profile (JSON) — self profile. */
export async function GET() {
  return withUser(async (user) => {
    const data = await profileData(user)
    if (!data) abort(404, 'Profile not found.')
    return NextResponse.json(data)
  })
}

/** Port WorkspaceController::updateProfile — edit name + email. */
export async function PUT(req: NextRequest) {
  return withUser(async (user) => {
    const body = await req.json().catch(() => ({}))
    const errors: Record<string, string[]> = {}
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    if (!name) errors.name = ['The name field is required.']
    else if (name.length > 120) errors.name = ['The name may not be greater than 120 characters.']
    if (!email) errors.email = ['The email field is required.']
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = ['The email must be a valid email address.']
    if (Object.keys(errors).length) abortValidation(errors)

    const updated = await updateProfile(user.id, name, email)
    return NextResponse.json({ user: updated })
  })
}
