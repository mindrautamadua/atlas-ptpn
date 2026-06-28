import { NextResponse } from 'next/server'
import { withUser } from '@/lib/http-route'
import { inboxToday } from '@/lib/inbox'

export const dynamic = 'force-dynamic'

/** Port WorkspaceController::inboxToday — GET /inbox/today */
export async function GET() {
  return withUser(async (user) => {
    return NextResponse.json(await inboxToday(user.id))
  })
}
