import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Mirror of ProgramService::listArchived. */
export async function GET() {
  await requireUser()
  const programs = await prisma.program.findMany({
    where: { archivedAt: { not: null } },
    orderBy: { archivedAt: 'desc' },
    select: {
      id: true, name: true, code: true, archivedAt: true, archivedById: true,
      _count: { select: { initiatives: true } },
    },
  })

  const archiverIds = [...new Set(programs.map((p) => p.archivedById).filter((x): x is number => x != null))]
  const archivers = archiverIds.length
    ? await prisma.user.findMany({ where: { id: { in: archiverIds } }, select: { id: true, name: true } })
    : []
  const archiverMap = new Map(archivers.map((a) => [a.id, a.name]))

  const data = programs.map((p) => ({
    id: p.id, name: p.name, code: p.code,
    archivedAt: p.archivedAt ? p.archivedAt.toISOString() : '',
    archivedByName: p.archivedById != null ? archiverMap.get(p.archivedById) ?? null : null,
    workstreamCount: p._count.initiatives,
  }))

  return NextResponse.json({ data })
}
