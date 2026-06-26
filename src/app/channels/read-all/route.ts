import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiUser, errorResponse } from '@/lib/channels'

export const dynamic = 'force-dynamic'

// ── PUT /channels/read-all — ChannelController::markAllRead ───────────────────
export async function PUT() {
  try {
    const user = await requireApiUser()
    await prisma.channelMember.updateMany({
      where: { userId: user.id },
      data: { lastViewedAt: new Date() },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
