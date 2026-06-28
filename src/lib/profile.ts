import 'server-only'
import { prisma } from '@/lib/db'
import type { AuthUser } from '@/lib/auth'

/* Port WorkspaceController::profile + OrgChainService::getEscalationChain.
 * Self-profile: identity (relasi di-resolve by id — relasi unit/directorate
 * tak reliabel), supervisor chain, subordinates, position history. */

export type PersonNode = { id: number; name: string; roleType: string; positionTitle?: string | null; avatarUrl?: string | null }

const MAX_DEPTH = 10

/** Port getDirectSupervisor — managerUserId, lewati atasan non-aktif (naik). */
async function getDirectSupervisor(managerUserId: number | null): Promise<{ id: number; name: string; roleType: string; positionTitle: string | null; avatarUrl: string | null; managerUserId: number | null } | null> {
  if (!managerUserId) return null
  const m = await prisma.user.findUnique({
    where: { id: managerUserId },
    select: { id: true, name: true, roleType: true, positionTitle: true, avatarUrl: true, managerUserId: true, isActive: true },
  })
  if (!m) return null
  if (!m.isActive) return getDirectSupervisor(m.managerUserId)
  return { id: m.id, name: m.name, roleType: m.roleType ?? '', positionTitle: m.positionTitle, avatarUrl: m.avatarUrl, managerUserId: m.managerUserId }
}

/** Port getEscalationChain — rantai atasan (index 0 = atasan langsung). */
export async function getEscalationChain(userId: number, maxLevels = 6): Promise<PersonNode[]> {
  const chain: PersonNode[] = []
  const visited = new Set<number>([userId])
  const start = await prisma.user.findUnique({ where: { id: userId }, select: { managerUserId: true } })
  let currentManagerId = start?.managerUserId ?? null
  let level = 0
  while (level < maxLevels && level < MAX_DEPTH && currentManagerId) {
    const sup = await getDirectSupervisor(currentManagerId)
    if (!sup || visited.has(sup.id)) break
    visited.add(sup.id)
    chain.push({ id: sup.id, name: sup.name, roleType: sup.roleType, positionTitle: sup.positionTitle, avatarUrl: sup.avatarUrl })
    currentManagerId = sup.managerUserId
    level++
  }
  return chain
}

export async function profileData(authUser: AuthUser) {
  const u = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: {
      id: true, userId: true, nik: true, name: true, email: true, roleType: true,
      positionTitle: true, avatarUrl: true, isActive: true, directorateId: true, unitId: true, positionId: true,
    },
  })
  if (!u) return null

  const [directorate, unit, position, subordinates, supervisorChain, positionHistory] = await Promise.all([
    u.directorateId ? prisma.directorate.findUnique({ where: { id: u.directorateId }, select: { id: true, code: true, name: true } }) : null,
    u.unitId ? prisma.organizationalUnit.findUnique({ where: { id: u.unitId }, select: { id: true, code: true, name: true } }) : null,
    u.positionId ? prisma.position.findUnique({ where: { id: u.positionId }, select: { id: true, code: true, name: true, levelCode: true, roleType: true, reportsToPositionId: true } }) : null,
    prisma.user.findMany({ where: { managerUserId: authUser.id }, select: { id: true, name: true, email: true, roleType: true, positionTitle: true, avatarUrl: true } }),
    getEscalationChain(authUser.id, 6),
    prisma.positionHistory.findMany({
      where: { userId: authUser.id },
      orderBy: { startDate: 'desc' },
      select: {
        id: true, startDate: true, endDate: true, mutationType: true, mutationReason: true, skNumber: true,
        position: { select: { id: true, code: true, name: true, levelCode: true } },
      },
    }),
  ])

  return {
    user: {
      id: u.id, userId: u.userId, nik: u.nik, name: u.name, email: u.email ?? '',
      roleType: u.roleType ?? '', positionTitle: u.positionTitle, avatarUrl: u.avatarUrl, isActive: u.isActive,
      directorate: directorate ?? undefined, unit: unit ?? undefined, position: position ?? undefined,
    },
    supervisorChain,
    subordinates: subordinates.map((s) => ({ id: s.id, name: s.name, email: s.email, roleType: s.roleType ?? '', positionTitle: s.positionTitle, avatarUrl: s.avatarUrl })),
    positionHistory: positionHistory.map((h) => ({
      id: h.id,
      startDate: h.startDate.toISOString(),
      endDate: h.endDate?.toISOString(),
      mutationType: h.mutationType,
      mutationReason: h.mutationReason ?? undefined,
      skNumber: h.skNumber ?? undefined,
      position: h.position ? { id: h.position.id, code: h.position.code, name: h.position.name, levelCode: h.position.levelCode } : undefined,
    })),
  }
}

export async function updateProfile(userId: number, name: string, email: string) {
  const updated = await prisma.user.update({ where: { id: userId }, data: { name, email }, select: { id: true, name: true, email: true } })
  return updated
}
