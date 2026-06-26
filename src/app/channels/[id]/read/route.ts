import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiUser, errorResponse } from '@/lib/channels'

export const dynamic = 'force-dynamic'

// ── PUT /channels/[id]/read — ChannelController::markRead ─────────────────────
export async function PUT(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser()
    const { id } = await params
    const channelId = Number(id)

    await prisma.channelMember.updateMany({
      where: { channelId, userId: user.id },
      data: { lastViewedAt: new Date() },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
