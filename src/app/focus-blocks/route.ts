import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withUser, abortValidation } from '@/lib/http-route'

export const dynamic = 'force-dynamic'

/** Port dari WorkspaceController::focusBlocks — list focus blocks satu user. */
export async function GET(req: NextRequest) {
  return withUser(async (user) => {
    const { searchParams } = new URL(req.url)
    const userId = Number(searchParams.get('forUserId')) || user.id

    const where: Record<string, unknown> = { userId }
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const startAt: Record<string, Date> = {}
    if (from) startAt.gte = new Date(from)
    // PHP men-append ' 23:59:59' agar mencakup seluruh hari `to`.
    if (to) startAt.lte = new Date(to + 'T23:59:59')
    if (from || to) where.startAt = startAt

    const data = await prisma.focusBlock.findMany({
      where,
      orderBy: { startAt: 'asc' },
    })
    return NextResponse.json({ data })
  })
}

/** Port dari WorkspaceController::storeFocusBlock — buat focus block. */
export async function POST(req: NextRequest) {
  return withUser(async (user) => {
    const body = await req.json().catch(() => ({}))
    const errors: Record<string, string[]> = {}

    const title = body.title
    if (title != null && (typeof title !== 'string' || title.length > 120)) {
      errors.title = ['The title may not be greater than 120 characters.']
    }
    const startAtRaw = body.startAt
    const startDate = startAtRaw != null ? new Date(startAtRaw) : null
    if (startAtRaw == null || startAtRaw === '') {
      errors.startAt = ['The startAt field is required.']
    } else if (!startDate || isNaN(startDate.getTime())) {
      errors.startAt = ['The startAt is not a valid date.']
    }
    const endAtRaw = body.endAt
    const endDate = endAtRaw != null ? new Date(endAtRaw) : null
    if (endAtRaw == null || endAtRaw === '') {
      errors.endAt = ['The endAt field is required.']
    } else if (!endDate || isNaN(endDate.getTime())) {
      errors.endAt = ['The endAt is not a valid date.']
    } else if (startDate && !isNaN(startDate.getTime()) && endDate.getTime() <= startDate.getTime()) {
      errors.endAt = ['The endAt must be a date after startAt.']
    }
    const note = body.note
    if (note != null && (typeof note !== 'string' || note.length > 500)) {
      errors.note = ['The note may not be greater than 500 characters.']
    }

    if (Object.keys(errors).length) abortValidation(errors)

    const data = await prisma.focusBlock.create({
      data: {
        userId: user.id,
        title: title ?? 'Focus Time',
        startAt: startDate!,
        endAt: endDate!,
        note: note ?? null,
        createdAt: new Date(),
      },
    })
    return NextResponse.json({ data })
  })
}
