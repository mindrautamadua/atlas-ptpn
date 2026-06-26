import { NextRequest, NextResponse } from 'next/server'
import { withUser, abortValidation } from '@/lib/http-route'
import { previewChain } from '@/lib/assignments'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return withUser(async (user) => {
    const assigneeId = Number(req.nextUrl.searchParams.get('assigneeId'))
    if (!Number.isInteger(assigneeId)) abortValidation({ assigneeId: ['The assignee is required.'] })
    return NextResponse.json(await previewChain(user, assigneeId))
  })
}
