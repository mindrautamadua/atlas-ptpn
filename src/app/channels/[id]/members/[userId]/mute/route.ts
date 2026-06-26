import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import {
  requireApiUser, errorResponse, validationError, HttpError, isAdminRole,
} from '@/lib/channels'

export const dynamic = 'force-dynamic'

// ── PUT /channels/[id]/members/[userId]/mute — ChannelController::toggleMute ──
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const actor = await requireApiUser()
    const { id, userId: userIdParam } = await params
    const channelId = Number(id)
    const userId = Number(userIdParam)
    const body = await req.json().catch(() => ({}))

    if (typeof body?.isMuted !== 'boolean') throw validationError('The isMuted field is required.')

    const isAdmin = isAdminRole(actor.roleType)
    if (!isAdmin && actor.id !== userId) {
      throw new HttpError(403, 'You can only change notification settings for your own channels.')
    }

    await prisma.channelMember.updateMany({
      where: { channelId, userId },
      data: { isMuted: body.isMuted },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
