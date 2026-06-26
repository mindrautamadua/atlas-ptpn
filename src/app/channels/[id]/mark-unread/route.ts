import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiUser, errorResponse, validationError } from '@/lib/channels'

export const dynamic = 'force-dynamic'

// ── PUT /channels/[id]/mark-unread — ChannelController::markUnread ────────────
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser()
    const { id } = await params
    const channelId = Number(id)
    const body = await req.json().catch(() => ({}))

    const messageId = Number(body?.messageId)
    if (!Number.isInteger(messageId)) throw validationError('The messageId field is required.')

    const message = await prisma.channelMessage.findUnique({
      where: { id: messageId },
      select: { createdAt: true },
    })
    if (!message) throw validationError('Message not found.')

    const markAt = new Date(message.createdAt.getTime() - 1000)
    await prisma.channelMember.updateMany({
      where: { channelId, userId: user.id },
      data: { lastViewedAt: markAt },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
