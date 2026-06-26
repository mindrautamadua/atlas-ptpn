import 'server-only'
import { cache } from 'react'
import { prisma } from '@/lib/db'

/**
 * Port dari ScopeResolver.php (asalnya backend/src/lib/scope.ts).
 *
 *   SUPERADMIN / ADMIN → semua (userIds = null, tanpa filter)
 *   BOD                → semua user di direktoratnya
 *   KADIV / KASUBDIV   → user di unit + anak-unit (BFS sampai 4 level)
 *   ASISTEN            → diri sendiri + direct reports (managerUserId)
 *   OFFICER            → semua user di unit yang sama
 *   default            → self-scope (diri sendiri saja)
 *
 * Memo per-request via React cache() (pengganti TTL 30s Laravel Cache).
 */
export type UserScope = {
  userIds: number[] | null // null = tanpa filter (lihat semua)
  unitIds: number[] | null
}

export type ScopeUser = {
  id: number
  roleType: string | null
  unitId: number | null
  directorateId: number | null
}

const MAX_BFS_DEPTH = 4

export const allowsAllUsers = (scope: UserScope) => scope.userIds === null

function selfScope(user: ScopeUser): UserScope {
  return { userIds: [user.id], unitIds: user.unitId ? [user.unitId] : [] }
}

/** BFS iteratif — root unit + semua anak unit sampai 4 level. */
async function getUnitSubtree(rootUnitId: number): Promise<number[]> {
  const visited = new Set<number>([rootUnitId])
  let frontier = [rootUnitId]

  for (let depth = 0; depth < MAX_BFS_DEPTH && frontier.length > 0; depth++) {
    const children = await prisma.organizationalUnit.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    })
    const next: number[] = []
    for (const { id } of children) {
      if (!visited.has(id)) {
        visited.add(id)
        next.push(id)
      }
    }
    frontier = next
  }
  return [...visited]
}

export const resolveUserScope = cache(async (user: ScopeUser): Promise<UserScope> => {
  const role = (user.roleType ?? '').toUpperCase()

  if (role === 'SUPERADMIN' || role === 'ADMIN') {
    return { userIds: null, unitIds: null }
  }

  if (role === 'BOD') {
    if (!user.directorateId) return selfScope(user)
    const users = await prisma.user.findMany({
      where: { directorateId: user.directorateId, isActive: true },
      select: { id: true, unitId: true },
    })
    const unitIds = [...new Set(users.map((u) => u.unitId).filter((x): x is number => x != null))]
    return { userIds: users.map((u) => u.id), unitIds }
  }

  if (role === 'KADIV' || role === 'KASUBDIV') {
    if (!user.unitId) return selfScope(user)
    const unitIds = await getUnitSubtree(user.unitId)
    const users = await prisma.user.findMany({
      where: { unitId: { in: unitIds }, isActive: true },
      select: { id: true },
    })
    return { userIds: users.map((u) => u.id), unitIds }
  }

  if (role === 'ASISTEN') {
    const reports = await prisma.user.findMany({
      where: { managerUserId: user.id, isActive: true },
      select: { id: true },
    })
    return {
      userIds: [user.id, ...reports.map((u) => u.id)],
      unitIds: user.unitId ? [user.unitId] : [],
    }
  }

  if (role === 'OFFICER') {
    if (!user.unitId) return selfScope(user)
    const users = await prisma.user.findMany({
      where: { unitId: user.unitId, isActive: true },
      select: { id: true },
    })
    return { userIds: users.map((u) => u.id), unitIds: [user.unitId] }
  }

  return selfScope(user)
})

/**
 * Port dari MembershipResolver.php — program-id yang user lihat lewat
 * partisipasi (owner / co-PIC / owner workstream / assignee task / member channel),
 * di luar scope unit. Penting untuk program kolaboratif lintas unit.
 */
export const getProgramIdsViaMembership = cache(async (userId: number): Promise<number[]> => {
  const ids = new Set<number>()

  // 1. Owner Program
  const owned = await prisma.program.findMany({ where: { ownerId: userId }, select: { id: true } })
  owned.forEach((p) => ids.add(p.id))

  // 2. Co-PIC Program (entity_pics)
  const coPic = await prisma.entityPic.findMany({
    where: { entityType: 'Program', userId },
    select: { entityId: true },
  })
  coPic.forEach((e) => ids.add(e.entityId))

  // 3. Owner Workstream (Initiative) → programId
  const wsOwned = await prisma.initiative.findMany({ where: { ownerId: userId }, select: { programId: true } })
  wsOwned.forEach((w) => ids.add(w.programId))

  // 4. Assignee Task (WorkItem) → initiative.programId
  const tasks = await prisma.workItem.findMany({
    where: { assignedTo: userId },
    select: { initiative: { select: { programId: true } } },
  })
  tasks.forEach((t) => t.initiative && ids.add(t.initiative.programId))

  // 5. Member Channel → linkedProgramId + linkedInitiativeId(→programId)
  const channels = await prisma.channelMember.findMany({
    where: { userId },
    select: { channel: { select: { linkedProgramId: true, linkedInitiativeId: true } } },
  })
  const linkedWorkstreamIds: number[] = []
  for (const { channel } of channels) {
    if (channel?.linkedProgramId != null) ids.add(channel.linkedProgramId)
    if (channel?.linkedInitiativeId != null) linkedWorkstreamIds.push(channel.linkedInitiativeId)
  }
  if (linkedWorkstreamIds.length) {
    const ws = await prisma.initiative.findMany({
      where: { id: { in: [...new Set(linkedWorkstreamIds)] } },
      select: { programId: true },
    })
    ws.forEach((w) => ids.add(w.programId))
  }

  return [...ids]
})
