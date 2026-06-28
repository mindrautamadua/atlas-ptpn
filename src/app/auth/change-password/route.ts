import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { withUser, abortValidation } from '@/lib/http-route'

export const dynamic = 'force-dynamic'

/** Port WorkspaceController::changePassword — POST /auth/change-password. */
export async function POST(req: NextRequest) {
  return withUser(async (user) => {
    const body = await req.json().catch(() => ({}))
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''
    const errors: Record<string, string[]> = {}
    if (!currentPassword) errors.currentPassword = ['The currentPassword field is required.']
    if (!newPassword || newPassword.length < 8) errors.newPassword = ['The newPassword must be at least 8 characters.']
    if (Object.keys(errors).length) abortValidation(errors)

    const row = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } })
    const ok = row?.passwordHash ? await bcrypt.compare(currentPassword, row.passwordHash) : false
    if (!ok) return NextResponse.json({ message: 'The current password is incorrect.' }, { status: 422 })

    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } })
    return NextResponse.json({ message: 'Password updated successfully.' })
  })
}
