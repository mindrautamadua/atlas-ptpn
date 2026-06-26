import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import {
  requireApiUser, errorResponse, validationError, HttpError,
  isAdminRole, isDmName, loadChannelOrThrow,
} from '@/lib/channels'

export const dynamic = 'force-dynamic'

// ── POST /channels/[id]/join — ChannelController::join ────────────────────────
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser()
    const { id } = await params
    const channelId = Number(id)

    const channel = await loadChannelOrThrow(channelId)
    const isAdmin = isAdminRole(user.roleType)

    if (channel.isArchived) throw validationError('This channel is already archived.')

    if (!isAdmin) {
      if (channel.type !== 'PUBLIC') {
        throw new HttpError(403, 'Private channels can only be accessed by invitation.')
      }
      if (isDmName(channel.name)) {
        throw new HttpError(403, 'Direct messages do not support open join.')
      }
    }

    const member = await prisma.channelMember.upsert({
      where: { channelId_userId: { channelId, userId: user.id } },
      create: { channelId, userId: user.id, isMuted: false, isStarred: false },
      update: { isMuted: false, isStarred: false },
    })

    return NextResponse.json({ data: member })
  } catch (e) {
    return errorResponse(e)
  }
}
