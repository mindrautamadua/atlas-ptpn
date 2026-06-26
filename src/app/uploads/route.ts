import { NextResponse, type NextRequest } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { requireApiUser, errorResponse, validationError } from '@/lib/channels'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 10 * 1024 * 1024 // 10MB

/**
 * POST /uploads — multipart file upload ke disk publik.
 * Port dari WorkspaceController::upload (disederhanakan: tulis ke public/uploads).
 */
export async function POST(req: NextRequest) {
  try {
    await requireApiUser()

    const form = await req.formData()
    const files = form.getAll('files').filter((f): f is File => f instanceof File)
    if (files.length === 0) throw validationError('The files field is required.')

    const dir = join(process.cwd(), 'public', 'uploads')
    await mkdir(dir, { recursive: true })

    const attachments: Array<{ url: string; name: string; type: string; size: number }> = []
    for (const file of files) {
      if (file.size > MAX_BYTES) {
        throw validationError('Each file may not be larger than 10MB.')
      }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const filename = `${Date.now()}-${Math.round(performance.now())}-${safeName}`
      const buf = Buffer.from(await file.arrayBuffer())
      await writeFile(join(dir, filename), buf)
      attachments.push({
        url: `/uploads/${filename}`,
        name: file.name,
        type: file.type,
        size: file.size,
      })
    }

    return NextResponse.json({ data: attachments })
  } catch (e) {
    return errorResponse(e)
  }
}
