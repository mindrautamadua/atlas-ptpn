import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withUser, abort, abortValidation } from '@/lib/http-route'
import { canUploadEvidence, isAdminRole } from '@/lib/assignments'
import { putPrivateFile } from '@/lib/storage'

export const dynamic = 'force-dynamic'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB
const ALLOWED_MIME_PREFIXES = [
  'image/', 'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument',
  'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
  'text/', 'application/zip', 'application/x-zip-compressed',
]

const isMimeAllowed = (mime: string) => !!mime && ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p))

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  return withUser(async (user) => {
    const { id } = await params
    const aid = Number(id)
    const a = await prisma.assignment.findUnique({ where: { id: aid }, select: { assigneeId: true, status: true } })
    if (!a) abort(404, 'Assignment not found.')
    if (!canUploadEvidence(a, user.id, isAdminRole(user.roleType))) {
      abort(403, 'Only the PIC may upload evidence, and only before the assignment is completed.')
    }

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) abortValidation({ file: ['A file is required.'] })
    if (file.size > MAX_FILE_SIZE) abortValidation({ file: ['The file may not be larger than 20 MB.'] })
    if (!isMimeAllowed(file.type)) abortValidation({ file: [`File type is not allowed: ${file.type || 'unknown'}`] })

    const description = typeof form.get('description') === 'string' ? (form.get('description') as string) : null

    const originalName = file.name || 'file'
    const dot = originalName.lastIndexOf('.')
    const baseName = (dot > 0 ? originalName.slice(0, dot) : originalName)
      .replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60)
    const ext = dot > 0 ? originalName.slice(dot + 1) : ''
    const storedName = `${Date.now()}-${randomBytes(8).toString('hex')}-${baseName}${ext ? `.${ext}` : ''}`
    const relativePath = `assignments/${aid}/${storedName}`

    const buffer = Buffer.from(await file.arrayBuffer())
    await putPrivateFile(relativePath, buffer)

    const attachment = await prisma.assignmentAttachment.create({
      data: {
        assignmentId: aid,
        uploadedBy: user.id,
        type: 'FILE',
        filename: storedName,
        originalName,
        filepath: relativePath,
        filesize: file.size,
        description,
      },
      include: { uploader: { select: { id: true, name: true, positionTitle: true } } },
    })
    return NextResponse.json({ data: attachment }, { status: 201 })
  })
}
