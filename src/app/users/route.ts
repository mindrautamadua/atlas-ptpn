import { NextResponse, type NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { withUser, abort, abortValidation } from '@/lib/http-route'
import { prisma } from '@/lib/db'
import { ADMIN_USER_SELECT, enrichUsers, enrichUser, CAN_MANAGE_USERS } from '@/lib/users-admin'

export const dynamic = 'force-dynamic'

/** Port WorkspaceController::users — admin user list with filters. */
export async function GET(request: NextRequest) {
  return withUser(async (user) => {
    if (!CAN_MANAGE_USERS.has((user.roleType ?? '').toUpperCase())) abort(403, 'Not allowed.')
    const sp = request.nextUrl.searchParams
    const search = sp.get('search')?.trim() ?? ''
    const role = sp.get('role')
    const active = sp.get('active')

    const where: Record<string, unknown> = {}
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { userId: { contains: search, mode: 'insensitive' } },
        { nik: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (role) where.roleType = role
    if (active != null) where.isActive = active === 'true' || active === '1'

    const rows = await prisma.user.findMany({ where, orderBy: { name: 'asc' }, select: ADMIN_USER_SELECT })
    const data = await enrichUsers(rows)
    return NextResponse.json({ data, total: data.length })
  })
}

/** Port WorkspaceController::storeUser — create user (admin). */
export async function POST(request: NextRequest) {
  return withUser(async (user) => {
    if (!CAN_MANAGE_USERS.has((user.roleType ?? '').toUpperCase())) abort(403, 'Not allowed.')
    const body = await request.json().catch(() => ({}))
    const errors: Record<string, string[]> = {}
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    if (!name || name.length > 120) errors.name = ['The name field is required (max 120).']
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = ['A valid email is required.']
    const userId = body.userId ? String(body.userId).trim() : null
    const nik = body.nik ? String(body.nik).trim() : null
    const phone = body.phone ? String(body.phone).trim() : null
    const roleType = typeof body.roleType === 'string' ? body.roleType : ''
    if (!roleType) errors.roleType = ['The roleType field is required.']
    const positionId = body.positionId != null ? Number(body.positionId) : null

    // Unique checks (email/userId/nik)
    for (const [field, val] of [['email', email], ['userId', userId], ['nik', nik]] as const) {
      if (val) {
        const exists = await prisma.user.findFirst({ where: { [field]: val }, select: { id: true } })
        if (exists) errors[field] = [`The ${field} has already been taken.`]
      }
    }
    if (Object.keys(errors).length) abortValidation(errors)

    const position = positionId ? await prisma.position.findUnique({ where: { id: positionId }, select: { id: true, divisionId: true, directorateId: true, name: true, roleType: true } }) : null

    const created = await prisma.user.create({
      data: {
        name, email, userId, nik, phone,
        roleType: position?.roleType ?? roleType,
        unitId: position?.divisionId ?? null,
        directorateId: position?.directorateId ?? null,
        positionId: position?.id ?? null,
        positionTitle: position?.name ?? null,
        isActive: true,
        passwordHash: await bcrypt.hash('DKMR2026', 10),
      },
      select: { id: true },
    })

    if (position) {
      await prisma.positionHistory.create({
        data: { userId: created.id, positionId: position.id, startDate: new Date(), mutationType: 'initial_assignment' },
      })
    }

    return NextResponse.json({ data: await enrichUser(created.id) }, { status: 201 })
  })
}
