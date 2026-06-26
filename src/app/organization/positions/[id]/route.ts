import { NextResponse, type NextRequest } from 'next/server'
import { withUser, abort, abortValidation } from '@/lib/http-route'
import { canManageUsers } from '@/lib/role-policy'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** PATCH /organization/positions/{id} — mirror OrganizationController@updatePosition. */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  return withUser(async (user) => {
    if (!canManageUsers(user.roleType)) abort(403, 'This action is unauthorized.')

    const id = Number((await ctx.params).id)
    if (!Number.isFinite(id)) abort(404, 'Position not found.')

    const existing = await prisma.position.findUnique({ where: { id }, select: { id: true } })
    if (!existing) abort(404, 'Position not found.')

    const body = await request.json().catch(() => null)
    if (!body) abort(422, 'Invalid payload.')

    const data: Record<string, unknown> = {}
    const errors: Record<string, string[]> = {}

    if (body.code !== undefined) {
      const code = String(body.code).trim()
      if (code.length < 2 || code.length > 40) errors.code = ['Code must be 2–40 characters.']
      else {
        const dup = await prisma.position.findFirst({ where: { code, id: { not: id } }, select: { id: true } })
        if (dup) errors.code = ['Code already exists.']
        else data.code = code
      }
    }
    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (name.length < 2 || name.length > 120) errors.name = ['Name must be 2–120 characters.']
      else data.name = name
    }
    if (body.levelCode !== undefined) data.levelCode = String(body.levelCode)
    if (body.roleType !== undefined) data.roleType = String(body.roleType)
    if (body.directorateId !== undefined) data.directorateId = body.directorateId != null ? Number(body.directorateId) : null
    if (body.divisionId !== undefined) data.divisionId = body.divisionId != null ? Number(body.divisionId) : null
    if (body.reportsToPositionId !== undefined) data.reportsToPositionId = body.reportsToPositionId != null ? Number(body.reportsToPositionId) : null
    if (body.seatOrder !== undefined) data.seatOrder = body.seatOrder != null ? Number(body.seatOrder) : null
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive)

    if (Object.keys(errors).length) abortValidation(errors)

    const position = await prisma.position.update({ where: { id }, data })
    return NextResponse.json({ data: position })
  })
}

/** DELETE /organization/positions/{id} — mirror OrganizationController@destroyPosition. */
export async function DELETE(_request: NextRequest, ctx: Ctx) {
  return withUser(async (user) => {
    if (!canManageUsers(user.roleType)) abort(403, 'This action is unauthorized.')

    const id = Number((await ctx.params).id)
    if (!Number.isFinite(id)) abort(404, 'Position not found.')

    const existing = await prisma.position.findUnique({ where: { id }, select: { id: true } })
    if (!existing) abort(404, 'Position not found.')

    // Unassign users from this position first, then delete.
    await prisma.$transaction([
      prisma.user.updateMany({ where: { positionId: id }, data: { positionId: null } }),
      prisma.position.delete({ where: { id } }),
    ])

    return NextResponse.json({ ok: true })
  })
}
