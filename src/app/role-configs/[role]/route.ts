import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withUser, abort, abortValidation } from '@/lib/http-route'

export const dynamic = 'force-dynamic'

const CAN_MANAGE = new Set(['ADMIN', 'SUPERADMIN'])
type Ctx = { params: Promise<{ role: string }> }

/** Port WorkspaceController::updateRoleConfig — PUT /role-configs/{role} (admin). */
export async function PUT(req: NextRequest, { params }: Ctx) {
  return withUser(async (user) => {
    if (!CAN_MANAGE.has((user.roleType ?? '').toUpperCase())) abort(403, 'Not allowed.')
    const { role } = await params
    const body = await req.json().catch(() => ({}))
    const description = body.description == null ? '' : String(body.description)
    if (description.length > 500) abortValidation({ description: ['The description may not be greater than 500 characters.'] })
    await prisma.roleConfig.updateMany({ where: { role }, data: { description } })
    return NextResponse.json({ ok: true })
  })
}
