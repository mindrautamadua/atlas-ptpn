import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withUser } from '@/lib/http-route'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** Port dari WorkspaceController::destroyFocusBlock — hapus, scoped ke pemilik. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return withUser(async (user) => {
    const { id } = await params
    await prisma.focusBlock.deleteMany({
      where: { id: Number(id), userId: user.id },
    })
    return NextResponse.json({ ok: true })
  })
}
