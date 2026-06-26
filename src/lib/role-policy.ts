// Port dari atlas-php app/Support/RolePolicy.php — pure role checks reusable di
// route handlers maupun server components.

export function normRole(role?: string | null): string {
  return (role ?? '').toLowerCase()
}

export function isAdminOrAbove(role?: string | null): boolean {
  const r = normRole(role)
  return r === 'superadmin' || r === 'admin'
}

export function isSuperadmin(role?: string | null): boolean {
  return normRole(role) === 'superadmin'
}

export function canManageUsers(role?: string | null): boolean {
  return isAdminOrAbove(role)
}
