import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

const VALID = new Set(['ONLINE', 'AWAY', 'DO_NOT_DISTURB', 'OFFLINE'])

/**
 * Mirror of WorkspaceController::updateMyStatus.
 * Broadcast di-drop (SSE → polling, lihat memory project-sse-dropped-polling-only):
 * user lain pick up perubahan via poll /users/presence (~5s).
 */
export async function PUT(req: Request) {
  const user = await requireUser()

  const body = await req.json().catch(() => ({})) as {
    status?: string; statusEmoji?: string | null; statusMessage?: string | null
  }
  const status = String(body?.status ?? '')
  if (!VALID.has(status)) {
    return NextResponse.json({ message: 'Invalid status' }, { status: 422 })
  }
  const statusEmoji = body?.statusEmoji ? String(body.statusEmoji).slice(0, 32) : null
  const statusMessage = body?.statusMessage ? String(body.statusMessage).slice(0, 160) : null
  const now = new Date()

  const saved = await prisma.userStatus.upsert({
    where: { userId: user.id },
    update: { status, statusEmoji, statusMessage, lastActivityAt: now },
    create: { userId: user.id, status, statusEmoji, statusMessage, lastActivityAt: now },
  })

  return NextResponse.json({
    data: {
      id: saved.id,
      userId: saved.userId,
      status: saved.status,
      statusEmoji: saved.statusEmoji,
      statusMessage: saved.statusMessage,
      lastActivityAt: saved.lastActivityAt.toISOString(),
    },
  })
}
