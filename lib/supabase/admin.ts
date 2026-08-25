import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * The first service-role Supabase client in this app, introduced by
 * Milestone 13. lib/supabase/server.ts's own module doc used to say "no
 * service-role client exists in this app" — that is no longer true, and this
 * file is the one deliberate, narrow, documented exception.
 *
 * A CLIENT CREATED HERE BYPASSES ROW LEVEL SECURITY ENTIRELY. RLS is
 * therefore NOT the boundary for any caller of this module — each caller's
 * own boundary must be named explicitly:
 *
 *   - lib/subscription/settlement.ts — the HMAC signature on the Paystack
 *     webhook (lib/paystack/signature.ts), or requirePermission() when
 *     called from the post-checkout browser callback.
 *   - lib/subscription/sweep.ts — the CRON_SECRET bearer token checked by
 *     app/api/cron/subscriptions/route.ts.
 *   - lib/subscription/webhook-ledger.ts — same HMAC boundary as
 *     settlement.ts; kept separate so the Route Handler itself never
 *     imports this module directly (see that file's own doc).
 *
 * ONLY lib/subscription/** modules may import this — never a Route Handler
 * directly. Enforced by tests/unit/paystack/layering.test.ts, mirroring how
 * tests/unit/email/layering.test.ts pins Resend's endpoint to a single file.
 * The reason this needs a service-role client at all: extending a paid
 * subscription must not be reachable by anyone holding the public anon key
 * (see subscription_payments/webhook_events' SECURITY DEFINER functions in
 * 20260825100600, granted to service_role only) — there is no user session
 * on a webhook to authenticate as.
 */
export function createServiceRoleSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      'createServiceRoleSupabaseClient requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
    )
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
