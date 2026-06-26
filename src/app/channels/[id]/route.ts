import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { broadcastToUsers } from '@/lib/broadcast'
import {
  requireApiUser, errorResponse, validationError, HttpError,
  loadChannelOrThrow, requireChannelReadAccess, requireChannelOwner,
  getChannelMemberIds,
} from '@/lib/channels'

export const dynamic = 'force-dynamic'

// ── GET /channels/[id] — ChannelController::show ──────────────────────────────
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser()
    const { id } = await params
    const channelId = Number(id)

    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: {
        channelMembers: {
          include: {
            user: { select: { id: true, name: true, avatarUrl: true, roleType: true, positionTitle: true } },
          },
        },
      },
    })
    if (!channel) throw new HttpError(404, 'Channel not found.')

    await requireChannelReadAccess(channel, user)

    return NextResponse.json({
      channel,
      members: channel.channelMembers.map((m) => ({
        channelId: m.channelId,
        userId: m.userId,
        name: m.user?.name ?? null,
        roleType: m.user?.roleType ?? null,
        status: null,
        lastViewedAt: m.lastViewedAt,
        isMuted: m.isMuted,
      })),
    })
  } catch (e) {
    return errorResponse(e)
  }
}

// ── PUT /channels/[id] — ChannelController::update ────────────────────────────
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser()
    const { id } = await params
    const channelId = Number(id)
    const body = await req.json().catch(() => ({}))

    const data: { name?: string; description?: string | null; topicType?: string | null } = {}
    if (body?.name !== undefined) {
      const name = String(body.name)
      if (name.length > 80) throw validationError('The name field is too long (max 80).')
      data.name = name
    }
    if (body?.description !== undefined) data.description = body.description ?? null
    if (body?.topicType !== undefined) data.topicType = body.topicType ?? null

    const channel = await loadChannelOrThrow(channelId)
    requireChannelOwner(channel, user)

    const updated = await prisma.channel.update({ where: { id: channelId }, data })

    const memberIds = await getChannelMemberIds(channelId)
    await broadcastToUsers('channel:channel:updated', { channel: updated }, memberIds)

    return NextResponse.json({ data: updated })
  } catch (e) {
    return errorResponse(e)
  }
}

// ── DELETE /channels/[id] — ChannelController::destroy ────────────────────────
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser()
    const { id } = await params
    const channelId = Number(id)

    const channel = await loadChannelOrThrow(channelId)
    requireChannelOwner(channel, user)

    const memberIds = await getChannelMemberIds(channelId)
    await prisma.channel.update({ where: { id: channelId }, data: { isArchived: true } })

    await broadcastToUsers('channel:channel:archived', { channelId }, memberIds)

    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
