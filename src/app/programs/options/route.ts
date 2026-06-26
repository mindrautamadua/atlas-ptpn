import { NextResponse } from 'next/server'
import { withUser } from '@/lib/http-route'
import { listProgramsForUser } from '@/lib/programs'

export const dynamic = 'force-dynamic'

/**
 * Daftar program ringan yang ter-scope, untuk picker "link a program" di
 * modal create meeting. Reuse listProgramsForUser (sudah mengembalikan id/name/code).
 */
export async function GET() {
  return withUser(async (user) => {
    const data = await listProgramsForUser({
      id: user.id,
      roleType: user.roleType,
      unitId: user.unitId,
      directorateId: user.directorateId,
    })
    return NextResponse.json({ data })
  })
}
