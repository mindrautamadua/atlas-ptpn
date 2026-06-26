import { NextResponse, type NextRequest } from 'next/server'
import { withUser, abort, abortValidation } from '@/lib/http-route'
import { canManageUsers } from '@/lib/role-policy'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** PATCH /organization/units/{id} — mirror OrganizationController@updateUnit. */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  return withUser(async (user) => {
    if (!canManageUsers(user.roleType)) abort(403, 'This action is unauthorized.')

    const id = Number((await ctx.params).id)
    if (!Number.isFinite(id)) abort(404, 'Unit not found.')

    const existing = await prisma.organizationalUnit.findUnique({ where: { id }, select: { id: true } })
    if (!existing) abort(404, 'Unit not found.')

    const body = await request.json().catch(() => null)
    if (!body) abort(422, 'Invalid payload.')

    const data: Record<string, unknown> = {}
    const errors: Record<string, string[]> = {}

    if (body.code !== undefined) {
      const code = String(body.code).trim()
      if (code.length < 2 || code.length > 40) errors.code = ['Code must be 2–40 characters.']
      else {
        const dup = await prisma.organizationalUnit.findFirst({ where: { code, id: { not: id } }, select: { id: true } })
        if (dup) errors.code = ['Code already exists.']
        else data.code = code
      }
    }
    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (name.length < 2 || name.length > 120) errors.name = ['Name must be 2–120 characters.']
      else data.name = name
    }
    if (body.unitType !== undefined) data.unitType = String(body.unitType).trim()
    if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null
    if (body.directorateId !== undefined) data.directorateId = body.directorateId != null ? Number(body.directorateId) : null
    if (body.parentId !== undefined) data.parentId = body.parentId != null ? Number(body.parentId) : null
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive)

    if (Object.keys(errors).length) abortValidation(errors)

    const unit = await prisma.organizationalUnit.update({ where: { id }, data })
    return NextResponse.json({ data: unit })
  })
}

/** DELETE /organization/units/{id} — mirror OrganizationController@destroyUnit. */
export async function DELETE(_request: NextRequest, ctx: Ctx) {
  return withUser(async (user) => {
    if (!canManageUsers(user.roleType)) abort(403, 'This action is unauthorized.')

    const id = Number((await ctx.params).id)
    if (!Number.isFinite(id)) abort(404, 'Unit not found.')

    const existing = await prisma.organizationalUnit.findUnique({ where: { id }, select: { id: true } })
    if (!existing) abort(404, 'Unit not found.')

    // Detach references first so the delete never trips a FK constraint;
    // positions, users, and child units lose their unit reference.
    await prisma.$transaction([
      prisma.user.updateMany({ where: { unitId: id }, data: { unitId: null } }),
      prisma.position.updateMany({ where: { divisionId: id }, data: { divisionId: null } }),
      prisma.organizationalUnit.updateMany({ where: { parentId: id }, data: { parentId: null } }),
      prisma.organizationalUnit.delete({ where: { id } }),
    ])

    return NextResponse.json({ ok: true })
  })
}
