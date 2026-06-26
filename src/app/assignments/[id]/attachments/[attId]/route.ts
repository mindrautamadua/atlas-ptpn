import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withUser, abort } from '@/lib/http-route'
import { isAdminRole } from '@/lib/assignments'
import { deletePrivateFile } from '@/lib/storage'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; attId: string }> }

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return withUser(async (user) => {
    const { id, attId } = await params
    const att = await prisma.assignmentAttachment.findFirst({
      where: { id: Number(attId), assignmentId: Number(id) },
    })
    if (!att) abort(404, 'Attachment not found.')

    if (!isAdminRole(user.roleType) && att.uploadedBy !== user.id) {
      abort(403, 'Only the uploader can delete this attachment.')
    }

    if (att.type === 'FILE' && att.filepath) await deletePrivateFile(att.filepath)
    await prisma.assignmentAttachment.delete({ where: { id: att.id } })

    return NextResponse.json({ ok: true })
  })
}
