import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

import { getCurrentUserContext } from '@/lib/auth/context'
import { resolvePermission, type PermissionScope } from '@/lib/auth/permissions'

/**
 * The shared server-side authorization guard
 * (docs/milestones/03-authentication-and-rbac-foundation.md Scope: "a
 * reusable guard... used by every Server Action/Route Handler in every
 * later milestone — the single place permission checks happen"). Every
 * later milestone imports requirePermission() rather than re-checking
 * permissions inline — see this file's own module doc for the pattern to
 * copy.
 *
 * Deliberately throws rather than redirecting on a denied permission check
 * (unlike requireUser(), which redirects): a denied *permission* inside an
 * already-authenticated Server Action is a caller error or a UI that showed
 * a control it shouldn't have — the caller decides whether that's a thrown
 * 403 in a Route Handler or a form-state error in a Server Action. An
 * unauthenticated *session*, by contrast, always means "go sign in".
 */
export class AuthorizationError extends Error {
  constructor(permissionKey: string) {
    super(`Missing permission: ${permissionKey}`)
    this.name = 'AuthorizationError'
  }
}

export async function requireUser(): Promise<User> {
  const { user } = await getCurrentUserContext()
  if (!user) redirect('/sign-in')
  return user
}

export async function requirePermission(
  permissionKey: string,
  scope: PermissionScope,
): Promise<User> {
  const { user, grants } = await getCurrentUserContext()
  if (!user) redirect('/sign-in')

  if (!resolvePermission(grants, permissionKey, scope)) {
    throw new AuthorizationError(permissionKey)
  }

  return user
}
