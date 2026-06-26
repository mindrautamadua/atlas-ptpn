import { NextResponse, type NextRequest } from 'next/server'
import { withUser, abort, abortValidation } from '@/lib/http-route'
import { canManageUsers } from '@/lib/role-policy'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** GET /organization/directorates — mirror OrganizationController@directorates (all + unitCount). */
export async function GET() {
  return withUser(async () => {
    const dirs = await prisma.directorate.findMany({
      orderBy: { code: 'asc' },
      include: { _count: { select: { organizationalUnits: true } } },
    })
    const data = dirs.map(({ _count, ...d }) => ({ ...d, unitCount: _count.organizationalUnits }))
    return NextResponse.json({ data })
  })
}

/** POST /organization/directorates — mirror OrganizationController@storeDirectorate. */
export async function POST(request: NextRequest) {
  return withUser(async (user) => {
    if (!canManageUsers(user.roleType)) abort(403, 'This action is unauthorized.')

    const body = await request.json().catch(() => null)
    if (!body) abort(422, 'Invalid payload.')

    const code = String(body.code ?? '').trim()
    const name = String(body.name ?? '').trim()
    const errors: Record<string, string[]> = {}
    if (code.length < 2 || code.length > 40) errors.code = ['Code must be 2–40 characters.']
    if (name.length < 2 || name.length > 120) errors.name = ['Name must be 2–120 characters.']
    if (!errors.code) {
      const dup = await prisma.directorate.findFirst({ where: { code }, select: { id: true } })
      if (dup) errors.code = ['Code already exists.']
    }
    if (Object.keys(errors).length) abortValidation(errors)

    const dir = await prisma.directorate.create({
      data: {
        code,
        name,
        shortName: body.shortName ? String(body.shortName).trim() : null,
        domain: body.domain ? String(body.domain).trim() : null,
        isActive: body.isActive ?? true,
      },
    })

    return NextResponse.json({ data: dir }, { status: 201 })
  })
}
