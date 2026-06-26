import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiUser, errorResponse, requireChannelAccess, HttpError } from '@/lib/channels'

export const dynamic = 'force-dynamic'

/**
 * POST /saved-messages/:messageId — simpan pesan.
 * Port dari WorkspaceController::storeSavedMessage.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  try {
    const user = await requireApiUser()
    const messageId = Number((await params).messageId)

    const message = await prisma.channelMessage.findUnique({
      where: { id: messageId },
      select: { channelId: true },
    })
    if (!message) throw new HttpError(404, 'Message not found.')

    // Read access — channel publik aktif atau anggota (atau admin).
    await requireChannelAccess(message.channelId, user, false)

    const saved = await prisma.savedMessage.upsert({
      where: { userId_messageId: { userId: user.id, messageId } },
      create: { userId: user.id, messageId, createdAt: new Date() },
      update: {},
    })

    return NextResponse.json({ data: { id: saved.id } })
  } catch (e) {
    return errorResponse(e)
  }
}

/**
 * DELETE /saved-messages/:messageId — hapus dari saved.
 * Port dari WorkspaceController::destroySavedMessage.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  try {
    const user = await requireApiUser()
    const messageId = Number((await params).messageId)

    await prisma.savedMessage.deleteMany({ where: { userId: user.id, messageId } })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
