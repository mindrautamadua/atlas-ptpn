import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withUser, abort, abortValidation } from '@/lib/http-route'
import { broadcastAll } from '@/lib/broadcast'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** Port dari BlockerController::updateResolution — edit resolution + optimistic lock. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return withUser(async (user) => {
    const { id } = await params

    const blocker = await prisma.blocker.findUnique({ where: { id: Number(id) } })
    if (!blocker) abort(404, 'Blocker not found.')

    // NOTE: simplified read-only check — RolePolicy::isReadOnly belum diport.
    if (user.roleType === 'GUEST' || user.roleType == null) {
      abort(403, 'Your role is not allowed to perform this action.')
    }

    // NOTE: blocker task scope check not ported (assertCanModifyBlockerTask di-skip).

    const body = await req.json().catch(() => ({}))
    const errors: Record<string, string[]> = {}

    const resolution = body.resolution
    if (resolution == null || typeof resolution !== 'string' || resolution.length === 0) {
      errors.resolution = ['The resolution field is required.']
    } else if (resolution.length > 2000) {
      errors.resolution = ['The resolution may not be greater than 2000 characters.']
    }

    const expectedUpdatedAt = body.expectedUpdatedAt
    let expectedDate: Date | null = null
    if (expectedUpdatedAt != null && expectedUpdatedAt !== '') {
      expectedDate = new Date(expectedUpdatedAt)
      if (isNaN(expectedDate.getTime())) {
        errors.expectedUpdatedAt = ['The expectedUpdatedAt is not a valid date.']
      }
    }

    if (Object.keys(errors).length) abortValidation(errors)

    // Optimistic locking — lindungi dari edit konkuren.
    if (expectedDate) {
      const serverIso = blocker.updatedAt?.toISOString() ?? null
      const clientIso = expectedDate.toISOString()
      if (serverIso && serverIso !== clientIso) {
        return NextResponse.json(
          {
            message: "A colleague's change was saved first. Refresh to see the latest version.",
            currentResolution: blocker.resolution,
            currentUpdatedAt: serverIso,
          },
          { status: 409 },
        )
      }
    }

    const fresh = await prisma.blocker.update({
      where: { id: blocker.id },
      data: { resolution },
    })

    // Broadcast ke semua user — frontend filter berdasarkan blocker.id.
    await broadcastAll('blocker:changed', {
      id: blocker.id,
      action: 'resolution-updated',
      resolution: fresh.resolution,
      updatedBy: { id: user.id, name: user.name },
      updatedAt: fresh.updatedAt?.toISOString() ?? null,
    })

    return NextResponse.json({ data: fresh })
  })
}
