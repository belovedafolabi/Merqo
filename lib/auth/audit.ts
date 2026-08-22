import type { SupabaseClient } from '@supabase/supabase-js'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getRequestMeta } from '@/lib/auth/request-context'

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
