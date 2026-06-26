import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withUser, abort, abortValidation } from '@/lib/http-route'
import { findForUser, canUploadEvidence, isAdminRole } from '@/lib/assignments'

export const dynamic = 'force-dynamic'

const ATT_INCLUDE = { uploader: { select: { id: true, name: true, positionTitle: true } } }

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  return withUser(async (user) => {
    const { id } = await params
    const aid = Number(id)
    await findForUser(user, aid) // enforce visibility
    const items = await prisma.assignmentAttachment.findMany({
      where: { assignmentId: aid },
      include: ATT_INCLUDE,
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json({ data: items, total: items.length })
  })
}

export async function POST(req: NextRequest, { params }: Ctx) {
  return withUser(async (user) => {
    const { id } = await params
    const aid = Number(id)
    const a = await prisma.assignment.findUnique({ where: { id: aid }, select: { assigneeId: true, status: true } })
    if (!a) abort(404, 'Assignment not found.')
    if (!canUploadEvidence(a, user.id, isAdminRole(user.roleType))) {
      abort(403, 'Only the PIC may add evidence, before the assignment is completed.')
    }

    const body = await req.json().catch(() => ({}))
    const errors: Record<string, string[]> = {}
    if (body.type !== 'LINK' && body.type !== 'NOTE') errors.type = ['Invalid evidence type.']
    const description = typeof body.description === 'string' ? body.description.trim() : ''
    if (description.length < 1 || description.length > 2000) errors.description = ['A description is required.']
    if (body.type === 'LINK') {
      if (!body.url || typeof body.url !== 'string') errors.url = ['A URL is required.']
      else { try { new URL(body.url) } catch { errors.url = ['The URL is invalid.'] } }
    }
    if (Object.keys(errors).length) abortValidation(errors)

    const attachment = await prisma.assignmentAttachment.create({
      data: {
        assignmentId: aid,
        uploadedBy: user.id,
        type: body.type,
        url: body.type === 'LINK' ? body.url : null,
        description,
      },
      include: ATT_INCLUDE,
    })
    return NextResponse.json({ data: attachment }, { status: 201 })
  })
}
