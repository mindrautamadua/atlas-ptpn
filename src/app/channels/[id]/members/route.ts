import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import {
  requireApiUser, errorResponse, validationError,
  isAdminRole, isDmName, isChannelMember, loadChannelOrThrow,
} from '@/lib/channels'

export const dynamic = 'force-dynamic'

// ── POST /channels/[id]/members — ChannelController::addMember ────────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireApiUser()
    const { id } = await params
    const channelId = Number(id)
    const body = await req.json().catch(() => ({}))

    const userId = Number(body?.userId)
    if (!Number.isInteger(userId)) throw validationError('The userId field is required.')

    const channel = await loadChannelOrThrow(channelId)
    const isAdmin = isAdminRole(actor.roleType)

    const isMember = await isChannelMember(channelId, actor.id)
    if (!isMember && !isAdmin) throw validationError('You are not a member of this channel.')

    if (channel.type === 'PRIVATE' && isDmName(channel.name)) {
      throw validationError('Direct messages do not support adding new participants.')
    }

    if (!isAdmin && channel.createdBy !== actor.id) {
      throw validationError('Only the channel creator or an admin can add members.')
    }

    const member = await prisma.channelMember.upsert({
      where: { channelId_userId: { channelId, userId } },
      create: { channelId, userId, isMuted: false, isStarred: false },
      update: { isMuted: false, isStarred: false },
    })

    return NextResponse.json({ data: member }, { status: 201 })
  } catch (e) {
    return errorResponse(e)
  }
}
