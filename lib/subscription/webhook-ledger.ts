import { createServiceRoleSupabaseClient } from '@/lib/supabase/admin'

/**
 * The webhook idempotency ledger's application-layer entry points, called
 * only from app/api/webhooks/paystack/route.ts. Kept out of the Route
 * Handler itself (which has no other reason to import
 * lib/supabase/admin directly) so that module stays the app's only
 * documented boundary: every lib/supabase/admin import lives under
 * lib/subscription/**, never in a Route Handler — see
 * tests/unit/subscription/layering.test.ts.
 */

export interface WebhookEventClaim {
  eventRowId: string
  isDuplicate: boolean
}

export async function recordWebhookEvent(input: {
  provider: string
  eventId: string
  eventType: string
  reference: string | null
  payload: unknown
}): Promise<WebhookEventClaim> {
  const supabase = createServiceRoleSupabaseClient()
  const { data, error } = await supabase
    .rpc('record_webhook_event', {
      p_provider: input.provider,
      p_event_id: input.eventId,
      p_event_type: input.eventType,
      p_reference: input.reference,
      p_payload: input.payload,
    })
    .single<{ event_row_id: string; is_duplicate: boolean }>()

  if (error) throw error
  return { eventRowId: data.event_row_id, isDuplicate: data.is_duplicate }
}

export async function markWebhookEvent(
  eventRowId: string,
  status: 'PROCESSED' | 'IGNORED' | 'FAILED',
  errorMessage?: string,
): Promise<void> {
  const supabase = createServiceRoleSupabaseClient()
  const { error } = await supabase.rpc('mark_webhook_event', {
    p_id: eventRowId,
    p_status: status,
    p_error: errorMessage ?? null,
  })
  if (error) throw error
}
