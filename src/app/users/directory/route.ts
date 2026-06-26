import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withUser } from '@/lib/http-route'

export const dynamic = 'force-dynamic'

/** Port dari WorkspaceController::usersDirectory — people-picker terkurasi. */
export async function GET() {
  return withUser(async () => {
    const data = await prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, email: true, roleType: true,
        positionTitle: true, avatarUrl: true, unitId: true, directorateId: true,
      },
    })
    return NextResponse.json({ data })
  })
}
