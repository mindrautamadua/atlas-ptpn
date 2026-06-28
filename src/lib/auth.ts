import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { readSession } from '@/lib/session'

export type AuthUser = {
  id: number
  email: string | null
  name: string
  roleType: string | null
  positionTitle: string | null
  avatarUrl: string | null
  unitId: number | null
  unit: { id: number; code: string | null; name: string } | null
  directorateId: number | null
  directorate: { code: string; name: string } | null
  managerUserId: number | null
  toursCompleted: unknown
  canAccessPerformance: boolean
}

/** Mirror of EnsurePerformanceAccess::allows — SUPERADMIN or directorate with scorecard data. */
async function resolvePerformanceAccess(roleType: string | null, directorateId: number | null) {
  if ((roleType ?? '').toUpperCase() === 'SUPERADMIN') return true
  if (!directorateId) return false
  const sc = await prisma.direktoratScorecard.findFirst({
    where: { directorateId },
    select: { id: true },
  })
  return Boolean(sc)
}

/** Cached per-request: returns the shared auth user shape, or null. */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const session = await readSession()
  if (!session) return null

  const user = await prisma.user.findFirst({
    where: { id: session.uid, isActive: true },
    select: {
      id: true,
      email: true,
      name: true,
      roleType: true,
      positionTitle: true,
      avatarUrl: true,
      unitId: true,
      directorateId: true,
      managerUserId: true,
      toursCompleted: true,
      unit: {
        select: { id: true, code: true, name: true },
      },
    },
  })
  if (!user) return null

  // Resolve directorate by id separately — the User→Directorate prisma relation
  // returns null in this dataset (cross-schema mapping quirk), so we query it
  // directly by directorateId. Same pattern as scorecard.ts / org-scope.ts.
  const directorate = user.directorateId
    ? await prisma.directorate.findUnique({
        where: { id: user.directorateId },
        select: { code: true, name: true },
      })
    : null

  const unit = user.unit
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roleType: user.roleType,
    positionTitle: user.positionTitle,
    avatarUrl: user.avatarUrl,
    unitId: user.unitId,
    unit: unit ? { id: unit.id, code: unit.code, name: unit.name } : null,
    directorateId: user.directorateId,
    directorate: directorate ? { code: directorate.code, name: directorate.name } : null,
    managerUserId: user.managerUserId,
    toursCompleted: user.toursCompleted ?? [],
    canAccessPerformance: await resolvePerformanceAccess(user.roleType, user.directorateId),
  }
})

/** Guard for protected pages: redirects to /login when unauthenticated. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}
