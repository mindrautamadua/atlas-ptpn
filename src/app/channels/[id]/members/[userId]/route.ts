import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import {
  requireApiUser, errorResponse, validationError,
  isAdminRole, isDmName, isChannelMember, loadChannelOrThrow,
} from '@/lib/channels'

export const dynamic = 'force-dynamic'

// ── DELETE /channels/[id]/members/[userId] — ChannelController::removeMember ──
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const actor = await requireApiUser()
    const { id, userId: userIdParam } = await params
    const channelId = Number(id)
    const userId = Number(userIdParam)

    const channel = await loadChannelOrThrow(channelId)
    const isAdmin = isAdminRole(actor.roleType)
    const isSelf = actor.id === userId

    if (!(await isChannelMember(channelId, userId))) {
      throw validationError('Member not found in this channel.')
    }

    if (!isSelf) {
      if (channel.type === 'PRIVATE' && isDmName(channel.name)) {
        throw validationError('A DM can only be closed by each participant individually.')
      }
      const canManage = isAdmin || channel.createdBy === actor.id
      if (!canManage) throw validationError('Only the channel creator or an admin can remove members.')
      if (userId === channel.createdBy && !isAdmin) {
        throw validationError('The channel creator can only leave on their own or be removed by an admin.')
      }
    }

    await prisma.channelMember.delete({ where: { channelId_userId: { channelId, userId } } })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
