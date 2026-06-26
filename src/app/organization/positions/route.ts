import { NextResponse, type NextRequest } from 'next/server'
import { withUser, abort, abortValidation } from '@/lib/http-route'
import { canManageUsers } from '@/lib/role-policy'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Derive numeric level from a levelCode like "BOD-1" / "M2" → 1 / 2 (null if none). */
function levelFromCode(levelCode: string | null): number | null {
  if (!levelCode) return null
  const digits = levelCode.replace(/[^0-9]/g, '')
  return digits ? Number(digits) : null
}

/** GET /organization/positions — mirror OrganizationController@positions. */
export async function GET() {
  return withUser(async () => {
    const positions = await prisma.position.findMany({
      orderBy: { seatOrder: 'asc' },
      include: {
        directorate: { select: { id: true, code: true, name: true } },
        division: { select: { id: true, code: true, name: true } },
        users: {
          where: { isActive: true },
          select: { id: true, name: true, roleType: true, positionId: true },
        },
      },
    })

    const data = positions.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      title: p.name,
      levelCode: p.levelCode,
      level: levelFromCode(p.levelCode),
      roleType: p.roleType,
      directorateId: p.directorateId,
      divisionId: p.divisionId,
      reportsToPositionId: p.reportsToPositionId,
      seatOrder: p.seatOrder,
      isActive: p.isActive,
      directorate: p.directorate,
      unit: p.division,
      currentHolder: p.users[0]
        ? { id: p.users[0].id, name: p.users[0].name, roleType: p.users[0].roleType }
        : null,
    }))

    return NextResponse.json({ data, total: data.length })
  })
}

/** POST /organization/positions — mirror OrganizationController@storePosition. */
export async function POST(request: NextRequest) {
  return withUser(async (user) => {
    if (!canManageUsers(user.roleType)) abort(403, 'This action is unauthorized.')

    const body = await request.json().catch(() => null)
    if (!body) abort(422, 'Invalid payload.')

    const code = String(body.code ?? '').trim()
    const name = String(body.name ?? '').trim()
    const levelCode = String(body.levelCode ?? '').trim()
    const roleType = String(body.roleType ?? '').trim()
    const errors: Record<string, string[]> = {}
    if (code.length < 2 || code.length > 40) errors.code = ['Code must be 2–40 characters.']
    if (name.length < 2 || name.length > 120) errors.name = ['Name must be 2–120 characters.']
    if (!levelCode) errors.levelCode = ['Level code is required.']
    if (!roleType) errors.roleType = ['Role type is required.']
    if (!errors.code) {
      const dup = await prisma.position.findFirst({ where: { code }, select: { id: true } })
      if (dup) errors.code = ['Code already exists.']
    }
    if (Object.keys(errors).length) abortValidation(errors)

    const position = await prisma.position.create({
      data: {
        code,
        name,
        levelCode,
        roleType,
        directorateId: body.directorateId != null ? Number(body.directorateId) : null,
        divisionId: body.divisionId != null ? Number(body.divisionId) : null,
        reportsToPositionId: body.reportsToPositionId != null ? Number(body.reportsToPositionId) : null,
        seatOrder: body.seatOrder != null ? Number(body.seatOrder) : null,
        isActive: body.isActive ?? true,
      },
    })

    return NextResponse.json({ data: position }, { status: 201 })
  })
}
