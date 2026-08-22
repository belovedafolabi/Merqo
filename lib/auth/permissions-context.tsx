'use client'

import { createContext, useContext } from 'react'

import { resolvePermission, type PermissionScope, type ScopeGrant } from '@/lib/auth/permissions'

/**
 * Frontend permission-aware primitive
 * (docs/milestones/03-authentication-and-rbac-foundation.md Frontend
 * Changes: "usePermission()/<Can> frontend primitive for conditionally
 * rendering UI"). Hiding a control is a UX nicety only — it is never the
 * security boundary; every action this might gate is independently checked
 * by lib/auth/guard.ts's requirePermission() server-side, and again by RLS.
 *
 * The provider is seeded once, server-side, with the same grants
 * lib/auth/context.ts resolves for the request (see app/(app)/layout.tsx) —
 * no client-side fetch, and no separate resolution logic: usePermission()
 * calls the exact same resolvePermission() the server guard does.
 */
const PermissionsContext = createContext<readonly ScopeGrant[] | null>(null)

export function PermissionsProvider({
  grants,
  children,
}: {
  grants: readonly ScopeGrant[]
  children: React.ReactNode
}) {
  return <PermissionsContext.Provider value={grants}>{children}</PermissionsContext.Provider>
}

export function usePermission(permissionKey: string, scope: PermissionScope): boolean {
  const grants = useContext(PermissionsContext)
  if (!grants) return false
  return resolvePermission(grants, permissionKey, scope)
}

/**
 * The current user's organization id, derived from the same grants
 * lib/branding/queries.ts derives it from server-side (grants[0]'s
 * organization_id) — this project's single-tenant-per-deployment model
 * means a signed-in user has exactly one. Used by client components (e.g.
 * components/shell/admin-sidebar.tsx) that need an organization id to build
 * a `<Can>` scope without threading it down as a prop from every layout.
 */
export function useCurrentOrganizationId(): string | null {
  const grants = useContext(PermissionsContext)
  return grants?.[0]?.organizationId ?? null
}
