import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withUser } from '@/lib/http-route'

export const dynamic = 'force-dynamic'

/** Port WorkspaceController::roleConfigs — GET /role-configs. */
export async function GET() {
  return withUser(async () => {
    const data = await prisma.roleConfig.findMany({
      orderBy: { role: 'asc' },
      select: { role: true, label: true, description: true, line: true, bodLevel: true, badgeColor: true },
    })
    return NextResponse.json({ data })
  })
}
