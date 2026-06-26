import 'server-only'
import { resolveUserScope, allowsAllUsers, type ScopeUser } from '@/lib/scope'

/**
 * Port dari app/Services/AssignmentAuthService.php.
 *
 * Role pemberi tugas: BOD, KADIV, KASUBDIV, ADMIN, SUPERADMIN.
 * Penerima harus di scope org pemberi (direct report / sub-tree unit);
 * admin bebas menugaskan ke siapa saja.
 */
const ASSIGNER_ROLES = ['BOD', 'KADIV', 'KASUBDIV', 'ADMIN', 'SUPERADMIN']
const PRIVATE_ROLES = ['BOD', 'KADIV', 'ADMIN', 'SUPERADMIN']

export function canCreateAssignment(role: string | null): boolean {
  return ASSIGNER_ROLES.includes((role ?? '').toUpperCase())
}

export async function canAssignTo(assigner: ScopeUser, assigneeId: number): Promise<boolean> {
  if (!canCreateAssignment(assigner.roleType)) return false
  const scope = await resolveUserScope(assigner)
  if (allowsAllUsers(scope)) return true
  return (scope.userIds ?? []).includes(assigneeId)
}

/** Role yang boleh menandai isPrivate=true (policy V1). */
export function canSetPrivate(role: string | null): boolean {
  return PRIVATE_ROLES.includes((role ?? '').toUpperCase())
}
