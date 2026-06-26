import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiUser, errorResponse } from '@/lib/channels'

export const dynamic = 'force-dynamic'

/**
 * GET /saved-messages — pesan yang disimpan user.
 * Port dari WorkspaceController::savedMessages.
 */
export async function GET() {
  try {
    const user = await requireApiUser()

    const rows = await prisma.savedMessage.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { message: { select: { id: true, channelId: true, content: true } } },
    })

    const data = rows.map((r) => ({
      id: r.message.id,
      channelId: r.message.channelId,
      content: r.message.content,
      createdAt: r.createdAt.toISOString(),
    }))

    return NextResponse.json({ data })
  } catch (e) {
    return errorResponse(e)
  }
}
