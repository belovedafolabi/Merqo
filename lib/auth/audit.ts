import type { SupabaseClient } from '@supabase/supabase-js'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getRequestMeta } from '@/lib/auth/request-context'
import { logger } from '@/lib/logger'

export interface AuditEvent {
  organizationId: string | null
  userId: string | null
  action: string
  resourceType: string
  resourceId?: string | null
  metadata?: Record<string, unknown>
}

/**
 * The shared audit-log write path
 * (docs/milestones/03-authentication-and-rbac-foundation.md API/Backend
 * Changes: "a shared recordAuditEvent() helper used by every mutation in
 * every later milestone"). Calls the record_audit_event() RPC
 * (supabase/migrations/20260822093500_create_audit_functions.sql) — the
 * only insert path into audit_logs, which is what makes the table
 * append-only at the database level.
 *
 * Accepts an optional client so it works both inside a Next.js request
 * (the default, reading IP/user-agent from next/headers) and from a
 * pre-session context like a failed sign-in, where the caller already has a
 * client instance to reuse.
 */
export async function recordAuditEvent(
  event: AuditEvent,
  supabaseClient?: SupabaseClient,
): Promise<void> {
  const supabase = supabaseClient ?? (await createServerSupabaseClient())
  const { ipAddress, userAgent } = await getRequestMeta()

  const { error } = await supabase.rpc('record_audit_event', {
    p_organization_id: event.organizationId,
    p_user_id: event.userId,
    p_action: event.action,
    p_resource_type: event.resourceType,
    p_resource_id: event.resourceId ?? null,
    p_metadata: event.metadata ?? {},
    p_ip_address: ipAddress,
    p_user_agent: userAgent,
  })

  if (error) throw error
}

/**
 * The two audit actions that must be recordable with no session at all.
 *
 * A literal union rather than `string` on purpose: the database allow-lists
 * exactly these two values, and a mismatch should be a compile error here
 * rather than a runtime exception at the worst possible moment (a user
 * failing to sign in, or a hostile webhook going unlogged).
 */
export type UnauthenticatedAuditAction = 'auth.sign_in_failed' | 'subscription.webhook_rejected'

/**
 * The sessionless audit write path.
 *
 * Calls record_unauthenticated_audit_event()
 * (supabase/migrations/20260826090200_create_auth_audit_event_function.sql)
 * rather than record_audit_event(), because Milestone 15's audit found that
 * the latter's grant to `anon` handed anyone holding the public anon key the
 * ability to forge audit rows for any organization. That grant is revoked;
 * this narrow function — which allow-lists the action, derives the
 * resource type from it, derives the user from auth.uid(), hardcodes the
 * organization to null, and rate-limits itself in SQL — is what `anon` may
 * call instead.
 *
 * Takes IP and user-agent as parameters rather than reading them itself:
 * the webhook caller is a Route Handler with a real NextRequest and no
 * cookies to read, so forcing getRequestMeta()'s next/headers dependency on
 * it would be the wrong coupling. app/(auth)/actions.ts passes what
 * getRequestMeta() already gave it.
 */
export async function recordUnauthenticatedAuditEvent(
  event: {
    action: UnauthenticatedAuditAction
    identifier?: string | null
    ipAddress?: string | null
    userAgent?: string | null
  },
  supabaseClient: SupabaseClient,
): Promise<void> {
  const { error } = await supabaseClient.rpc('record_unauthenticated_audit_event', {
    p_action: event.action,
    p_identifier: event.identifier ?? null,
    p_ip_address: event.ipAddress ?? null,
    p_user_agent: event.userAgent ?? null,
  })

  // Deliberately swallowed, unlike recordAuditEvent() above, which throws.
  //
  // Both callers are already on a failure path — a rejected sign-in, a
  // rejected webhook. If the audit write itself fails (most plausibly
  // because this IP tripped the function's own 30/minute flood limit), the
  // caller must still return its normal rejection, not a 500. Throwing here
  // would turn a working flood defence into a self-inflicted outage of the
  // sign-in screen for everyone behind that IP.
  //
  // Logged at warn, so a suppressed audit row is still observable.
  if (error) {
    logger.warn('audit.unauthenticated_write_failed', {
      action: event.action,
      error: error.message,
    })
  }
}
