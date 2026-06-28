import { NextRequest, NextResponse } from 'next/server'
import { withUser } from '@/lib/http-route'
import { listEscalations } from '@/lib/escalations'

export const dynamic = 'force-dynamic'

/** Port EscalationController::index — GET /escalations?filter=incoming|mine|all&status=… */
export async function GET(req: NextRequest) {
  return withUser(async (user) => {
    const filter = req.nextUrl.searchParams.get('filter') ?? 'incoming'
    const status = req.nextUrl.searchParams.get('status')
    const data = await listEscalations(user, filter, status)
    return NextResponse.json({ data, count: data.length })
  })
}
