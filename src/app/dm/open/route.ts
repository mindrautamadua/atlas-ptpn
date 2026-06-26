import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiUser, errorResponse, validationError } from '@/lib/channels'
import { broadcastToUsers } from '@/lib/broadcast'

export const dynamic = 'force-dynamic'

/**
 * POST /dm/open — buka (atau buat) DM 1:1 dengan user lain.
 * Port dari WorkspaceController::openDirectMessage.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser()
    const body = await req.json().catch(() => ({}))

    const otherUserId = Number(body?.userId)
    if (!Number.isInteger(otherUserId) || otherUserId <= 0) {
      throw validationError('The userId field is required.')
    }
    const exists = await prisma.user.findUnique({
      where: { id: otherUserId },
      select: { id: true },
    })
    if (!exists) throw validationError('The selected userId is invalid.')

    const ids = [user.id, otherUserId].sort((a, b) => a - b)
    const name = `dm-${ids[0]}-${ids[1]}`
    const now = new Date()

    let channel = await prisma.channel.findFirst({
      where: { name, type: 'PRIVATE' },
    })
    let wasNew = false
    if (!channel) {
      channel = await prisma.channel.create({
        data: {
          name,
          code: name,
          type: 'PRIVATE',
          description: 'Direct message',
          createdBy: user.id,
        },
      })
      wasNew = true
    }

    await prisma.channelMember.upsert({
      where: { channelId_userId: { channelId: channel.id, userId: user.id } },
      create: { channelId: channel.id, userId: user.id, joinedAt: now },
      update: {},
    })
    await prisma.channelMember.upsert({
      where: { channelId_userId: { channelId: channel.id, userId: otherUserId } },
      create: { channelId: channel.id, userId: otherUserId, joinedAt: now },
      update: {},
    })

    if (wasNew) {
      await broadcastToUsers('channel:channel:created', { channel }, [otherUserId])
    }

    return NextResponse.json({ data: { id: channel.id } })
  } catch (e) {
    return errorResponse(e)
  }
}
