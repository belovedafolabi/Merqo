import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Thin wrapper over the check_login_throttle()/record_login_attempt() RPCs
 * (supabase/migrations/20260822093400_create_login_throttle_functions.sql).
 * Takes the client as a parameter (like lib/auth/context.ts's
 * fetchPermissionGrants) so it's usable both from app/(auth)/actions.ts and
 * directly from integration tests.
 */
export async function isLoginThrottled(
  supabaseClient: SupabaseClient,
  identifier: string,
): Promise<boolean> {
  const { data, error } = await supabaseClient.rpc('check_login_throttle', {
    p_identifier: identifier,
  })
  if (error) throw error
  return Boolean(data)
}

export async function recordLoginAttempt(
  supabaseClient: SupabaseClient,
  identifier: string,
  ipAddress: string | null,
  succeeded: boolean,
): Promise<void> {
  const { error } = await supabaseClient.rpc('record_login_attempt', {
    p_identifier: identifier,
    p_ip_address: ipAddress,
    p_succeeded: succeeded,
  })
  if (error) throw error
}
