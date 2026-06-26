import { prisma } from '@/lib/db'
import { requireApiUser, errorResponse } from '@/lib/channels'
import { broadcastToUsers } from '@/lib/broadcast'

export const dynamic = 'force-dynamic'

/**
 * POST /realtime/typing/:channelId — indikator mengetik ke anggota channel.
 * Fire-and-forget. Port dari RealtimeController::typing.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ channelId: string }> },
) {
  try {
    const user = await requireApiUser()
    const { channelId: channelIdRaw } = await params
    const channelId = Number(channelIdRaw)

    const members = await prisma.channelMember.findMany({
      where: { channelId, userId: { not: user.id } },
      select: { userId: true },
    })
    const otherMemberIds = members.map((m) => m.userId)

    if (otherMemberIds.length) {
      await broadcastToUsers(
        'channel:typing:start',
        { channelId, userId: user.id, userName: user.name },
        otherMemberIds,
      )
    }

    return new Response(null, { status: 204 })
  } catch (e) {
    return errorResponse(e)
  }
}
