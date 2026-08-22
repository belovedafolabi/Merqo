import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import { createServerSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import type { ScopeGrant } from '@/lib/auth/permissions'

interface PermissionGrantRow {
  permission_key: string
  organization_id: string
  branch_id: string | null
  business_unit_id: string | null
}

/**
 * Fetches the resolved permission grants for whichever user `supabaseClient`
 * is authenticated as, via the current_user_permission_grants() RPC
 * (supabase/migrations/20260822093300_create_authorization_functions.sql).
 * Takes the client as a parameter rather than resolving it internally so
 * this is callable from integration tests against a test user's session
 * without any Next.js request context (no next/headers involved here at
 * all) — see tests/integration/authorization.test.ts.
 */
export async function fetchPermissionGrants(supabaseClient: SupabaseClient): Promise<ScopeGrant[]> {
  const { data, error } = await supabaseClient.rpc('current_user_permission_grants')
  if (error) throw error

  return ((data ?? []) as PermissionGrantRow[]).map((row) => ({
    permissionKey: row.permission_key,
    organizationId: row.organization_id,
    branchId: row.branch_id,
    businessUnitId: row.business_unit_id,
  }))
}

/**
 * The current request's authenticated user, or null if unauthenticated.
 * cache()-memoized so multiple guard/layout calls within one request share
 * a single round trip instead of each re-fetching the session.
 *
 * Treats a missing Supabase config as "no user" rather than letting
 * createServerSupabaseClient() throw — mirrors proxy.ts's "not configured"
 * stance (see isSupabaseConfigured()'s doc) so requireUser() redirects to
 * /sign-in instead of every protected Server Component 500ing when
 * NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY are unset, e.g. the e2e CI job, which
 * never starts Supabase (tests/e2e/unauthenticated-redirect.spec.ts).
 */
export const getCurrentUser = cache(async () => {
  if (!isSupabaseConfigured()) {
    logger.warn('auth.supabase_not_configured')
    return null
  }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

/**
 * The "current user context" resolver every later milestone's Server
 * Actions/Route Handlers use (docs/milestones/03-authentication-and-rbac-foundation.md
 * API/Backend Changes: "Shared 'current user context' resolver... used
 * across the app"). Thin Next-specific wrapper combining getCurrentUser()
 * and fetchPermissionGrants() into one cache()-memoized call per request.
 */
export const getCurrentUserContext = cache(async () => {
  if (!isSupabaseConfigured()) {
    logger.warn('auth.supabase_not_configured')
    return { user: null, grants: [] as ScopeGrant[] }
  }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { user: null, grants: [] as ScopeGrant[] }

  const grants = await fetchPermissionGrants(supabase)
  return { user, grants }
})
