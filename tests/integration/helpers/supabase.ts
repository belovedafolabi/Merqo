import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

/**
 * Real Supabase clients against the local instance
 * (supabase/config.toml — `pnpm db:start` / `supabase start` in CI), used
 * for this milestone's auth/RLS/authorization integration tests. Unlike
 * tests/integration/helpers/db.ts's direct `pg` pool (M02's approach, still
 * used for schema/constraint tests), these go through GoTrue + PostgREST —
 * the real path a signed-in user's session takes — which is what lets the
 * RLS suite assert denial "via direct Supabase client calls that bypass
 * application code" per this milestone's Testing Requirements.
 */
const DEFAULT_LOCAL_URL = 'http://127.0.0.1:54321'
const DEFAULT_LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const DEFAULT_LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? DEFAULT_LOCAL_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? DEFAULT_LOCAL_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? DEFAULT_LOCAL_SERVICE_ROLE_KEY

/** A fresh, unauthenticated client — each test that signs in should create its own. */
export function createAnonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}

/**
 * Service-role client — TEST INFRASTRUCTURE ONLY, never used by application
 * code (see lib/supabase/server.ts's module doc). Used here to drive flows
 * that would otherwise require a real inbox, e.g. generating a password-
 * recovery link directly via the Auth Admin API.
 */
export function createServiceRoleClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export interface TestUser {
  client: SupabaseClient
  userId: string
  email: string
  password: string
}

/**
 * Signs up a fresh test user and returns a client already authenticated as
 * them (local config disables email confirmation, so signUp() returns a
 * live session immediately — see supabase/config.toml [auth.email]).
 */
export async function createTestUser(): Promise<TestUser> {
  const email = `test-${randomUUID()}@example.com`
  const password = `Test-${randomUUID()}`
  const client = createAnonClient()

  const { data, error } = await client.auth.signUp({ email, password })
  if (error) throw error
  if (!data.user || !data.session) {
    throw new Error(
      'expected signUp() to return a live session (email confirmation must be disabled)',
    )
  }

  return { client, userId: data.user.id, email, password }
}

/** Bootstraps an Organization + Owner role assignment for an already-signed-up test user. */
export async function bootstrapOrganization(
  user: TestUser,
  organizationName: string,
): Promise<{ organizationId: string; userRoleId: string }> {
  const { data, error } = await user.client
    .rpc('create_organization_with_owner', {
      p_organization_name: organizationName,
      p_organization_slug: `${organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 8)}`,
      p_full_name: 'Test Owner',
    })
    .single()

  if (error) throw error
  const row = data as { organization_id: string; user_role_id: string }
  return { organizationId: row.organization_id, userRoleId: row.user_role_id }
}
