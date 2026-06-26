import 'server-only'
import { prisma } from '@/lib/db'
import {
  resolveUserScope,
  getProgramIdsViaMembership,
  allowsAllUsers,
  type ScopeUser,
} from '@/lib/scope'

// Status yang tampil di list (mirror ProgramService.listForUser).
const LIST_STATUSES = ['ACTIVE', 'PENDING_KASUB', 'PENDING_KADIV', 'DRAFT', 'COMPLETED']

/** Shape mirrors the Inertia `Program` type consumed by ProgramsView. */
export type ProgramListItem = {
  id: number
  code: string
  name: string
  description: string | null
  status: string
  approvalStatus: string
  healthStatus: string | null
  priority: string
  progressPercent: number
  riskScore: number
  strategicAlignment: number
  startDate: string
  targetEndDate: string
  actualEndDate: string | null
  ownerId: number
  ownerUnitId: number | null
  submittedById: number | null
  rejectionNote: string | null
  kelompok: string | null
  pilarStrategis: string | null
  progresTerkini: string | null
  dukunganDibutuhkan: string | null
  autoHealthComputedAt: string | null
  workstreamCount: number
  activityCount: number
  messageCount: number
  kpiCount: number
  owner: { id: number; name: string; avatarUrl: string | null; roleType: string | null } | null
  picPersons: Array<{ id: number; name: string }>
  linkedChannel: { id: number; name: string } | null
}

export async function listProgramsForUser(user: ScopeUser): Promise<ProgramListItem[]> {
  const scope = await resolveUserScope(user)

  const baseWhere = {
    archivedAt: null,
    approvalStatus: { in: LIST_STATUSES },
  } as const

  // Scope filter: SUPERADMIN/ADMIN lihat semua; selain itu via membership ∪ owner-in-scope.
  let where: Record<string, unknown> = { ...baseWhere }
  if (!allowsAllUsers(scope)) {
    const membershipIds = await getProgramIdsViaMembership(user.id)
    where = {
      ...baseWhere,
      OR: [{ id: { in: membershipIds } }, { ownerId: { in: scope.userIds ?? [] } }],
    }
  }

  const programs = await prisma.program.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, code: true, name: true, description: true, status: true, approvalStatus: true,
      healthStatus: true, priority: true, progressPercent: true,
      strategicAlignment: true, startDate: true, targetEndDate: true, actualEndDate: true,
      kelompok: true, pilarStrategis: true, progresTerkini: true, dukunganDibutuhkan: true,
      autoHealthComputedAt: true, ownerId: true, ownerUnitId: true, submittedById: true,
      rejectionNote: true, linkedChannelId: true,
      _count: { select: { initiatives: true } },
    },
  })
  if (programs.length === 0) return []

  const ids = programs.map((p) => p.id)
  const ownerIds = [...new Set(programs.map((p) => p.ownerId))]
  const channelIds = [...new Set(programs.map((p) => p.linkedChannelId).filter((x): x is number => x != null))]

  const [owners, channels, kpiCounts, pics] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: ownerIds } },
      select: { id: true, name: true, avatarUrl: true, roleType: true },
    }),
    channelIds.length
      ? prisma.channel.findMany({ where: { id: { in: channelIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    prisma.kpiDefinition.groupBy({
      by: ['programId'],
      where: { programId: { in: ids }, isActive: true },
      _count: { _all: true },
    }),
    prisma.entityPic.findMany({
      where: { entityType: 'Program', entityId: { in: ids } },
      select: { entityId: true, user: { select: { id: true, name: true } } },
    }),
  ])

  const ownerMap = new Map(owners.map((o) => [o.id, o]))
  const channelMap = new Map(channels.map((c) => [c.id, c]))
  const kpiMap = new Map(kpiCounts.map((k) => [k.programId, k._count._all]))
  const picMap = new Map<number, Array<{ id: number; name: string }>>()
  for (const p of pics) {
    if (!p.user) continue
    const arr = picMap.get(p.entityId) ?? []
    arr.push({ id: p.user.id, name: p.user.name })
    picMap.set(p.entityId, arr)
  }

  const iso = (d: Date | null) => (d ? d.toISOString() : null)

  return programs.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    status: p.status,
    approvalStatus: p.approvalStatus,
    healthStatus: p.healthStatus,
    priority: p.priority,
    progressPercent: p.progressPercent,
    riskScore: 0,
    strategicAlignment: p.strategicAlignment ?? 0,
    startDate: p.startDate.toISOString(),
    targetEndDate: p.targetEndDate.toISOString(),
    actualEndDate: iso(p.actualEndDate),
    ownerId: p.ownerId,
    ownerUnitId: p.ownerUnitId,
    submittedById: p.submittedById,
    rejectionNote: p.rejectionNote,
    kelompok: p.kelompok,
    pilarStrategis: p.pilarStrategis,
    progresTerkini: p.progresTerkini,
    dukunganDibutuhkan: p.dukunganDibutuhkan,
    autoHealthComputedAt: iso(p.autoHealthComputedAt),
    workstreamCount: p._count.initiatives,
    activityCount: 0,
    messageCount: 0,
    kpiCount: kpiMap.get(p.id) ?? 0,
    owner: ownerMap.get(p.ownerId) ?? null,
    picPersons: picMap.get(p.id) ?? [],
    linkedChannel: (p.linkedChannelId != null && channelMap.get(p.linkedChannelId)) || null,
  }))
}
