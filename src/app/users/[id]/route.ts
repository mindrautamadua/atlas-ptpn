import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { withUser, abort, abortValidation } from '@/lib/http-route'
import { prisma } from '@/lib/db'
import { enrichUser, CAN_MANAGE_USERS } from '@/lib/users-admin'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** Port WorkspaceController::updateUser — toggle active / mutasi posisi / edit (admin). */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return withUser(async (actor) => {
    if (!CAN_MANAGE_USERS.has((actor.roleType ?? '').toUpperCase())) abort(403, 'Not allowed.')
    const { id } = await params
    const userId = Number(id)
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, positionId: true, roleType: true } })
    if (!target) abort(404, 'User not found.')

    const body = await req.json().catch(() => ({}))
    const errors: Record<string, string[]> = {}
    const update: Record<string, unknown> = {}

    if ('isActive' in body) update.isActive = Boolean(body.isActive)
    if (typeof body.name === 'string') update.name = body.name.trim()
    if (typeof body.phone === 'string') update.phone = body.phone.trim() || null

    // Unique-guarded fields
    for (const field of ['email', 'userId', 'nik'] as const) {
      if (field in body && body[field] != null) {
        const val = String(body[field]).trim()
        if (field === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { errors.email = ['A valid email is required.']; continue }
        if (val) {
          const clash = await prisma.user.findFirst({ where: { [field]: val, NOT: { id: userId } }, select: { id: true } })
          if (clash) { errors[field] = [`The ${field} has already been taken.`]; continue }
        }
        update[field] = val || null
      }
    }
    if (typeof body.password === 'string' && body.password.trim()) {
      if (body.password.length < 6) errors.password = ['The password must be at least 6 characters.']
      else update.passwordHash = await bcrypt.hash(body.password, 10)
    }
    if (Object.keys(errors).length) abortValidation(errors)

    // Position change → cascade unit/directorate/roleType + history
    const newPositionId = 'positionId' in body && body.positionId ? Number(body.positionId) : null
    const positionChanged = newPositionId != null && newPositionId !== target.positionId
    if (newPositionId != null) {
      const position = await prisma.position.findUnique({ where: { id: newPositionId }, select: { id: true, divisionId: true, directorateId: true, name: true, roleType: true } })
      if (!position) abort(422, 'Position not found.')
      update.positionId = position.id
      update.unitId = position.divisionId
      update.directorateId = position.directorateId
      update.positionTitle = position.name
      update.roleType = position.roleType ?? target.roleType
    }

    await prisma.user.update({ where: { id: userId }, data: update })

    if (positionChanged && newPositionId != null) {
      const now = new Date()
      await prisma.positionHistory.updateMany({ where: { userId, endDate: null }, data: { endDate: now } })
      await prisma.positionHistory.create({
        data: {
          userId, positionId: newPositionId, startDate: now,
          mutationType: typeof body.mutationType === 'string' ? body.mutationType : 'mutation',
          mutationReason: typeof body.mutationReason === 'string' ? body.mutationReason : null,
          skNumber: typeof body.skNumber === 'string' ? body.skNumber : null,
        },
      })
    }

    return NextResponse.json({ data: await enrichUser(userId) })
  })
}
