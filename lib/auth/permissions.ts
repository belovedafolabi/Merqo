/**
 * Pure permission-resolution logic — no database, no network, no Next.js
 * request context. This is deliberately the one place the scope-matching
 * rule lives, so lib/auth/guard.ts (server) and
 * lib/auth/permissions-context.tsx (client) both call the exact same
 * function instead of maintaining two implementations that could drift
 * apart. Fully covered by tests/unit/auth/permissions.test.ts per this
 * milestone's Testing Requirements ("permission-resolution logic... given
 * roles/scopes, does the guard produce the correct allow/deny decision").
 *
 * Mirrors the SQL in supabase/migrations/20260822093300_create_authorization_functions.sql
 * (current_user_permission_grants / user_has_permission) exactly — a grant's
 * null branch_id/business_unit_id means "wide": an org-wide grant matches
 * any branch/business unit in that org; a branch-wide grant matches any
 * business unit in that branch.
 */

export interface ScopeGrant {
  permissionKey: string
  organizationId: string
  branchId: string | null
  businessUnitId: string | null
}

export interface PermissionScope {
  organizationId: string
  branchId?: string
  businessUnitId?: string
}

export function resolvePermission(
  grants: readonly ScopeGrant[],
  permissionKey: string,
  scope: PermissionScope,
): boolean {
  return grants.some((grant) => {
    if (grant.permissionKey !== permissionKey) return false
    if (grant.organizationId !== scope.organizationId) return false

    // A grant scoped to a specific branch/business-unit must match the
    // requested one exactly; a null grant field means "wide" and matches
    // any requested value, including an unrequested (undefined) one. A
    // request with no branchId is therefore an org-level action, which only
    // an org-wide grant (branchId null) can satisfy.
    if (grant.branchId !== null && grant.branchId !== scope.branchId) return false
    if (grant.businessUnitId !== null && grant.businessUnitId !== scope.businessUnitId) return false

    return true
  })
}
