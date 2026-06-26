import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiUser, errorResponse, validationError } from '@/lib/channels'

export const dynamic = 'force-dynamic'

// ── PUT /channels/[id]/star — ChannelController::toggleStar ───────────────────
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser()
    const { id } = await params
    const channelId = Number(id)
    const body = await req.json().catch(() => ({}))

    if (typeof body?.isStarred !== 'boolean') throw validationError('The isStarred field is required.')

    await prisma.channelMember.updateMany({
      where: { channelId, userId: user.id },
      data: { isStarred: body.isStarred },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
