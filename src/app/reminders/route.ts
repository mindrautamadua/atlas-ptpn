import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiUser, errorResponse, validationError } from '@/lib/channels'

export const dynamic = 'force-dynamic'

/**
 * POST /reminders — set pengingat untuk sebuah pesan.
 * Port dari WorkspaceController::storeReminder.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser()
    const body = await req.json().catch(() => ({}))

    const channelId = Number(body?.channelId)
    if (!Number.isInteger(channelId)) throw validationError('The channelId field is required.')
    const messageId = Number(body?.messageId)
    if (!Number.isInteger(messageId)) throw validationError('The messageId field is required.')

    const remindAtRaw = body?.remindAt
    const remindAt = remindAtRaw ? new Date(remindAtRaw) : null
    if (!remindAt || Number.isNaN(remindAt.getTime())) {
      throw validationError('The remindAt field must be a valid date.')
    }

    let note: string | null = null
    if (body?.note != null) {
      note = String(body.note)
      if (note.length > 500) throw validationError('The note may not exceed 500 characters.')
    }

    const reminder = await prisma.messageReminder.create({
      data: {
        userId: user.id,
        channelId,
        messageId,
        remindAt,
        note,
        notified: false,
        createdAt: new Date(),
      },
    })

    return NextResponse.json({ data: { id: reminder.id } })
  } catch (e) {
    return errorResponse(e)
  }
}
