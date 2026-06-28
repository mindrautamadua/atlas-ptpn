import 'server-only'
import { prisma } from '@/lib/db'

/* Helper untuk AdminUsersView — resolve relasi unit/directorate/position by id
 * (relasi langsung tak reliabel di dataset ini) secara batch. */

export const ADMIN_USER_SELECT = {
  id: true, userId: true, nik: true, name: true, email: true, phone: true,
  roleType: true, isActive: true, positionTitle: true,
  unitId: true, directorateId: true, positionId: true,
} as const

type RawUser = {
  id: number; userId: string | null; nik: string | null; name: string; email: string | null
  phone: string | null; roleType: string | null; isActive: boolean; positionTitle: string | null
  unitId: number | null; directorateId: number | null; positionId: number | null
}

export type AdminUserRecord = {
  id: number; userId: string; nik?: string; name: string; email: string; phone?: string
  roleType: string; isActive: boolean; positionTitle?: string
  unit?: { id: number; code: string; name: string }
  directorate?: { id: number; code: string; name: string }
  position?: { id: number; code: string; name: string; levelCode: string; roleType: string }
}

export async function enrichUsers(rows: RawUser[]): Promise<AdminUserRecord[]> {
  const unitIds = [...new Set(rows.map((r) => r.unitId).filter((x): x is number => x != null))]
  const dirIds = [...new Set(rows.map((r) => r.directorateId).filter((x): x is number => x != null))]
  const posIds = [...new Set(rows.map((r) => r.positionId).filter((x): x is number => x != null))]

  const [units, dirs, positions] = await Promise.all([
    unitIds.length ? prisma.organizationalUnit.findMany({ where: { id: { in: unitIds } }, select: { id: true, code: true, name: true } }) : [],
    dirIds.length ? prisma.directorate.findMany({ where: { id: { in: dirIds } }, select: { id: true, code: true, name: true } }) : [],
    posIds.length ? prisma.position.findMany({ where: { id: { in: posIds } }, select: { id: true, code: true, name: true, levelCode: true, roleType: true } }) : [],
  ])
  const unitById = new Map(units.map((u) => [u.id, u]))
  const dirById = new Map(dirs.map((d) => [d.id, d]))
  const posById = new Map(positions.map((p) => [p.id, p]))

  return rows.map((r) => {
    const unit = r.unitId != null ? unitById.get(r.unitId) : undefined
    const dir = r.directorateId != null ? dirById.get(r.directorateId) : undefined
    const pos = r.positionId != null ? posById.get(r.positionId) : undefined
    return {
      id: r.id, userId: r.userId ?? '', nik: r.nik ?? undefined, name: r.name, email: r.email ?? '',
      phone: r.phone ?? undefined, roleType: r.roleType ?? '', isActive: r.isActive, positionTitle: r.positionTitle ?? undefined,
      unit: unit ? { id: unit.id, code: unit.code, name: unit.name } : undefined,
      directorate: dir ? { id: dir.id, code: dir.code, name: dir.name } : undefined,
      position: pos ? { id: pos.id, code: pos.code, name: pos.name, levelCode: pos.levelCode, roleType: pos.roleType } : undefined,
    }
  })
}

export async function enrichUser(id: number): Promise<AdminUserRecord | null> {
  const row = await prisma.user.findUnique({ where: { id }, select: ADMIN_USER_SELECT })
  if (!row) return null
  const [out] = await enrichUsers([row])
  return out
}

export const CAN_MANAGE_USERS = new Set(['ADMIN', 'SUPERADMIN'])
