import 'server-only'
import { cache } from 'react'
import { prisma } from '@/lib/db'

/**
 * Port of app/Auth/OrgScope.php — unit-level scope for executive program
 * dashboards (Home, Programs summary). Distinct from scope.ts which is
 * ownerId/membership-based.
 *
 *   BOD/ADMIN/SUPERADMIN (DIRUT) → portfolio-wide (isExecutive, unitIds=[])
 *   Direktur fungsional / KADIV  → all units under their directorate
 *   KASUBDIV                     → own unit only
 *   default                      → own unit (or empty)
 */
export type OrgScope = {
  isExecutive: boolean
  unitIds: number[]
  name: string | null
  level: 'portfolio' | 'directorate' | 'unit'
  role: string
}

type OrgScopeUser = {
  id: number
  roleType: string | null
  unitId: number | null
  directorateId: number | null
}

export const orgScopeForUser = cache(async (user: OrgScopeUser): Promise<OrgScope> => {
  const role = (user.roleType ?? '').toUpperCase()

  if (role === 'ADMIN' || role === 'SUPERADMIN') {
    return { isExecutive: true, unitIds: [], name: null, level: 'portfolio', role }
  }

  if (role === 'BOD' && user.directorateId) {
    const directorate = await prisma.directorate.findUnique({
      where: { id: user.directorateId },
      select: { code: true, name: true },
    })
    const isDirektorUtama = directorate && (directorate.code ?? '').toUpperCase() === 'DIRUT'
    if (isDirektorUtama) {
      return { isExecutive: true, unitIds: [], name: directorate?.name ?? null, level: 'portfolio', role }
    }
    const units = await prisma.organizationalUnit.findMany({
      where: { directorateId: user.directorateId },
      select: { id: true },
    })
    return {
      isExecutive: false,
      unitIds: units.map((u) => u.id),
      name: directorate?.name ?? null,
      level: 'directorate',
      role,
    }
  }

  if (role === 'KASUBDIV' && user.unitId) {
    const unit = await prisma.organizationalUnit.findUnique({
      where: { id: user.unitId },
      select: { name: true },
    })
    return { isExecutive: false, unitIds: [user.unitId], name: unit?.name ?? null, level: 'unit', role }
  }

  if (user.directorateId) {
    const [units, directorate] = await Promise.all([
      prisma.organizationalUnit.findMany({
        where: { directorateId: user.directorateId },
        select: { id: true },
      }),
      prisma.directorate.findUnique({ where: { id: user.directorateId }, select: { name: true } }),
    ])
    return {
      isExecutive: false,
      unitIds: units.map((u) => u.id),
      name: directorate?.name ?? null,
      level: 'directorate',
      role,
    }
  }

  // Fallback: own unit only
  let name: string | null = null
  if (user.unitId) {
    const unit = await prisma.organizationalUnit.findUnique({
      where: { id: user.unitId },
      select: { name: true },
    })
    name = unit?.name ?? null
  }
  return { isExecutive: false, unitIds: user.unitId ? [user.unitId] : [], name, level: 'unit', role }
})
