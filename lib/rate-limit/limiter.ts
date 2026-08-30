import type { SupabaseClient } from '@supabase/supabase-js'

import { logger } from '@/lib/logger'
import { RATE_LIMITS, type RateLimitBucket } from '@/lib/rate-limit/config'

/**
 * Thin wrapper over the consume_rate_limit() RPC
 * (supabase/migrations/20260826090100_create_rate_limit_functions.sql),
 * following lib/auth/login-throttle.ts's shape exactly: the client is a
 * parameter rather than resolved internally, so this is callable both from
 * Server Actions/Route Handlers and directly from integration tests with no
 * Next.js request context.
 */

export class RateLimitError extends Error {
  constructor(readonly bucket: RateLimitBucket) {
    super(`Rate limit exceeded: ${bucket}`)
    this.name = 'RateLimitError'
  }
}

/**
 * Consumes one slot from `bucket` for `identifier`. Returns true when the
 * call is permitted, false when the bucket is exhausted.
 *
 * FAILS OPEN if the RPC itself errors, and that is a deliberate decision
 * rather than an oversight — see docs/milestones/15-audit/rate-limiting.md.
 * A till must not stop selling because the limiter is unreachable; Paystack
 * retries a dropped webhook regardless; and for sign-in the pre-existing
 * per-identifier throttle (20260822093400) remains the real brute-force
 * control, so failing open here never leaves login unprotected.
 *
 * The trade is explicit: a limiter outage degrades to no limiting rather
 * than to an outage of the thing being limited. Every fail-open logs at
 * error level so it shows up as a visible incident instead of silently
 * disabling a security control.
 */
export async function consumeRateLimit(
  supabaseClient: SupabaseClient,
  bucket: RateLimitBucket,
  identifier: string | null,
): Promise<boolean> {
  const rule = RATE_LIMITS[bucket]

  // A null identifier means the request carried no x-forwarded-for (local
  // development, or a direct hit that bypassed the proxy). Bucketing all of
  // those together under one literal is deliberate: it keeps them limited
  // rather than exempt, and it cannot collide with a real IP.
  const key = identifier ?? 'unknown'

  const { data, error } = await supabaseClient.rpc('consume_rate_limit', {
    p_bucket: bucket,
    p_identifier: key,
    p_limit: rule.limit,
    p_window_seconds: rule.windowSeconds,
  })

  if (error) {
    logger.error('rate_limit.unavailable_failing_open', {
      bucket,
      error: error.message,
    })
    return true
  }

  const allowed = Boolean(data)
  if (!allowed) {
    logger.warn('rate_limit.tripped', { bucket, limit: rule.limit })
  }

  return allowed
}
