import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withUser, abort } from '@/lib/http-route'
import { findForUser } from '@/lib/assignments'
import { readPrivateFile } from '@/lib/storage'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; attId: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  return withUser(async (user) => {
    const { id, attId } = await params
    const aid = Number(id)
    await findForUser(user, aid) // enforce visibility

    const att = await prisma.assignmentAttachment.findFirst({
      where: { id: Number(attId), assignmentId: aid },
    })
    if (!att) abort(404, 'Attachment not found.')
    if (att.type !== 'FILE' || !att.filepath) abort(400, 'This attachment is not a file.')

    const buffer = await readPrivateFile(att.filepath)
    const filename = att.originalName ?? att.filename ?? 'file'
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
      },
    })
  })
}
