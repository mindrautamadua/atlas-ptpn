import { NextResponse, type NextRequest } from 'next/server'
import { withUser, abort } from '@/lib/http-route'
import { canManageUsers } from '@/lib/role-policy'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** PATCH /organization/positions/{id}/assign — mirror OrganizationController@assignPosition. */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  return withUser(async (user) => {
    if (!canManageUsers(user.roleType)) abort(403, 'This action is unauthorized.')

    const id = Number((await ctx.params).id)
    if (!Number.isFinite(id)) abort(404, 'Position not found.')

    const position = await prisma.position.findUnique({ where: { id }, select: { id: true } })
    if (!position) abort(404, 'Position not found.')

    const body = await request.json().catch(() => ({}))
    const userId = body?.userId != null ? Number(body.userId) : null
    const mutationType = body?.mutationType ? String(body.mutationType) : 'reassignment'
    const mutationReason = body?.mutationReason ? String(body.mutationReason) : null
    const skNumber = body?.skNumber ? String(body.skNumber) : null

    if (userId) {
      const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
      if (!target) abort(404, 'User not found.')
    }

    await prisma.$transaction(async (tx) => {
      // Unassign previous holder(s).
      await tx.user.updateMany({ where: { positionId: id }, data: { positionId: null } })

      if (userId) {
        await tx.user.update({ where: { id: userId }, data: { positionId: id } })
        await tx.positionHistory.create({
          data: {
            userId,
            positionId: id,
            startDate: new Date(),
            mutationType,
            mutationReason,
            skNumber,
            createdBy: user.id,
          },
        })
      }
    })

    const fresh = await prisma.position.findUnique({
      where: { id },
      include: { users: { where: { isActive: true }, select: { id: true, name: true, roleType: true } } },
    })
    return NextResponse.json({ data: fresh })
  })
}
