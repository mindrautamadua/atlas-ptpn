import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withUser } from '@/lib/http-route'

export const dynamic = 'force-dynamic'

/**
 * Port dari WorkspaceController::workstreams — list semua workstream.
 * Model "Workstream" = prisma.initiative (tabel Initiative → workstream).
 */
export async function GET() {
  return withUser(async () => {
    const data = await prisma.initiative.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        code: true,
        name: true,
        program: {
          select: {
            id: true,
            code: true,
            name: true,
            healthStatus: true,
            approvalStatus: true,
          },
        },
      },
    })
    return NextResponse.json({ data })
  })
}
