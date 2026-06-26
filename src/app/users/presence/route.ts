import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiUser, errorResponse } from '@/lib/channels'

export const dynamic = 'force-dynamic'

/**
 * GET /users/presence — daftar presence semua user.
 * Port dari WorkspaceController::usersPresence + presenceQuery.
 */
export async function GET() {
  try {
    await requireApiUser()

    const rows = await prisma.userStatus.findMany({
      orderBy: { user: { name: 'asc' } },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            roleType: true,
            positionTitle: true,
            avatarUrl: true,
            unitId: true,
            directorateId: true,
            unit: { select: { id: true, name: true, code: true } },
            directorate: { select: { id: true, name: true, code: true } },
          },
        },
      },
    })

    const users = rows.map((s) => ({
      id: s.userId,
      userId: s.userId,
      status: s.status,
      statusEmoji: s.statusEmoji,
      statusMessage: s.statusMessage,
      lastActivityAt: s.lastActivityAt.toISOString(),
      user: {
        id: s.user.id,
        name: s.user.name,
        email: s.user.email,
        roleType: s.user.roleType,
        positionTitle: s.user.positionTitle,
        avatarUrl: s.user.avatarUrl,
        unitId: s.user.unitId,
        directorateId: s.user.directorateId,
        unit: s.user.unit,
        directorate: s.user.directorate,
      },
    }))

    return NextResponse.json({ users })
  } catch (e) {
    return errorResponse(e)
  }
}
