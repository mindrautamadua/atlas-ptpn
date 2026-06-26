import { NextResponse, type NextRequest } from 'next/server'
import { withUser } from '@/lib/http-route'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** GET /users?search= — user search for pickers (assign position holder, etc). */
export async function GET(request: NextRequest) {
  return withUser(async () => {
    const search = request.nextUrl.searchParams.get('search')?.trim() ?? ''

    const where = {
      isActive: true,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { nik: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
              { userId: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { name: 'asc' },
        take: 50,
        select: {
          id: true,
          name: true,
          nik: true,
          email: true,
          roleType: true,
          positionTitle: true,
        },
      }),
      prisma.user.count({ where }),
    ])

    return NextResponse.json({ data: users, total })
  })
}
