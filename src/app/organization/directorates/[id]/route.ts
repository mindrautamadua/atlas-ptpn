import { NextResponse, type NextRequest } from 'next/server'
import { withUser, abort, abortValidation } from '@/lib/http-route'
import { canManageUsers } from '@/lib/role-policy'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** PATCH /organization/directorates/{id} — mirror OrganizationController@updateDirectorate. */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  return withUser(async (user) => {
    if (!canManageUsers(user.roleType)) abort(403, 'This action is unauthorized.')

    const id = Number((await ctx.params).id)
    if (!Number.isFinite(id)) abort(404, 'Directorate not found.')

    const existing = await prisma.directorate.findUnique({ where: { id }, select: { id: true } })
    if (!existing) abort(404, 'Directorate not found.')

    const body = await request.json().catch(() => null)
    if (!body) abort(422, 'Invalid payload.')

    const data: Record<string, unknown> = {}
    const errors: Record<string, string[]> = {}

    if (body.code !== undefined) {
      const code = String(body.code).trim()
      if (code.length < 2 || code.length > 40) errors.code = ['Code must be 2–40 characters.']
      else {
        const dup = await prisma.directorate.findFirst({ where: { code, id: { not: id } }, select: { id: true } })
        if (dup) errors.code = ['Code already exists.']
        else data.code = code
      }
    }
    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (name.length < 2 || name.length > 120) errors.name = ['Name must be 2–120 characters.']
      else data.name = name
    }
    if (body.shortName !== undefined) data.shortName = body.shortName ? String(body.shortName).trim() : null
    if (body.domain !== undefined) data.domain = body.domain ? String(body.domain).trim() : null
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive)

    if (Object.keys(errors).length) abortValidation(errors)

    const dir = await prisma.directorate.update({ where: { id }, data })
    return NextResponse.json({ data: dir })
  })
}

/** DELETE /organization/directorates/{id} — mirror OrganizationController@destroyDirectorate. */
export async function DELETE(_request: NextRequest, ctx: Ctx) {
  return withUser(async (user) => {
    if (!canManageUsers(user.roleType)) abort(403, 'This action is unauthorized.')

    const id = Number((await ctx.params).id)
    if (!Number.isFinite(id)) abort(404, 'Directorate not found.')

    const existing = await prisma.directorate.findUnique({ where: { id }, select: { id: true } })
    if (!existing) abort(404, 'Directorate not found.')

    // Detach references first so the delete never trips a FK constraint;
    // linked units/positions/users simply lose their directorate reference.
    await prisma.$transaction([
      prisma.organizationalUnit.updateMany({ where: { directorateId: id }, data: { directorateId: null } }),
      prisma.position.updateMany({ where: { directorateId: id }, data: { directorateId: null } }),
      prisma.user.updateMany({ where: { directorateId: id }, data: { directorateId: null } }),
      prisma.directorate.delete({ where: { id } }),
    ])

    return NextResponse.json({ ok: true })
  })
}
