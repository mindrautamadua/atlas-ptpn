import { NextResponse } from 'next/server'
import { withUser, abort } from '@/lib/http-route'
import { commitmentLedger } from '@/lib/individu'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** Port commitmentLedger — GET /commitment-ledger/{id}.
 *  Visibility: self / atasan / admin. OrgChain supervisor check disederhanakan
 *  (self + BOD/ADMIN/SUPERADMIN) — OrgChainService belum diport. */
export async function GET(_req: Request, { params }: Ctx) {
  return withUser(async (user) => {
    const { id } = await params
    const userId = Number(id)
    if (!Number.isInteger(userId)) abort(404, 'User not found.')
    const isSelf = user.id === userId
    const isAdmin = ['BOD', 'ADMIN', 'SUPERADMIN'].includes((user.roleType ?? '').toUpperCase())
    if (!isSelf && !isAdmin) abort(403, "You do not have access to this user's commitment ledger.")
    return NextResponse.json({ data: await commitmentLedger(userId) })
  })
}
