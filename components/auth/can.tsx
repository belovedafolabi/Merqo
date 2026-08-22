'use client'

import { usePermission } from '@/lib/auth/permissions-context'
import type { PermissionScope } from '@/lib/auth/permissions'

/**
 * Conditionally renders `children` when the current user holds
 * `permission` at `scope` — see lib/auth/permissions-context.tsx for why
 * this is a UX nicety, not a security boundary.
 */
export function Can({
  permission,
  scope,
  fallback = null,
  children,
}: {
  permission: string
  scope: PermissionScope
  fallback?: React.ReactNode
  children: React.ReactNode
}) {
  const allowed = usePermission(permission, scope)
  return allowed ? children : fallback
}
