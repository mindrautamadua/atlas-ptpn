import { NextResponse, type NextRequest } from 'next/server'
import { withUser, abort, abortValidation } from '@/lib/http-route'
import { canManageUsers } from '@/lib/role-policy'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** GET /organization/units — mirror OrganizationController@units (all + directorate relation). */
export async function GET() {
  return withUser(async () => {
    const units = await prisma.organizationalUnit.findMany({
      orderBy: { code: 'asc' },
      include: { directorate: { select: { id: true, code: true, name: true } } },
    })
    return NextResponse.json({ data: units, total: units.length })
  })
}

/** POST /organization/units — mirror OrganizationController@storeUnit. */
export async function POST(request: NextRequest) {
  return withUser(async (user) => {
    if (!canManageUsers(user.roleType)) abort(403, 'This action is unauthorized.')

    const body = await request.json().catch(() => null)
    if (!body) abort(422, 'Invalid payload.')

    const code = String(body.code ?? '').trim()
    const name = String(body.name ?? '').trim()
    const unitType = String(body.unitType ?? '').trim()
    const errors: Record<string, string[]> = {}
    if (code.length < 2 || code.length > 40) errors.code = ['Code must be 2–40 characters.']
    if (name.length < 2 || name.length > 120) errors.name = ['Name must be 2–120 characters.']
    if (!unitType) errors.unitType = ['Unit type is required.']
    if (!errors.code) {
      const dup = await prisma.organizationalUnit.findFirst({ where: { code }, select: { id: true } })
      if (dup) errors.code = ['Code already exists.']
    }
    if (Object.keys(errors).length) abortValidation(errors)

    const unit = await prisma.organizationalUnit.create({
      data: {
        code,
        name,
        unitType,
        description: body.description ? String(body.description).trim() : null,
        directorateId: body.directorateId != null ? Number(body.directorateId) : null,
        parentId: body.parentId != null ? Number(body.parentId) : null,
        isActive: body.isActive ?? true,
      },
    })

    return NextResponse.json({ data: unit }, { status: 201 })
  })
}
