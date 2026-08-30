/**
 * Every rate-limit threshold in the system, in one table.
 *
 * docs/milestones/15-security-qa-and-hardening.md's Acceptance Criteria
 * require rate limiting on login, webhook and checkout. This is the single
 * place those numbers are declared — the SQL side
 * (20260826090100_create_rate_limit_functions.sql) deliberately takes
 * limit/window as arguments rather than baking them in, so tuning never
 * means writing a migration.
 *
 * That is the one deliberate departure from check_login_throttle()'s
 * constants-in-the-function-body style (20260822093400): that function
 * serves exactly one caller, this one serves five buckets whose thresholds
 * want to be compared against each other at a glance.
 *
 * The `key` column below is load-bearing and is the part most likely to be
 * got wrong later, so it is documented per bucket rather than left implied.
 */

export type RateLimitBucket =
  | 'login'
  | 'login_reset'
  | 'webhook'
  | 'checkout'
  | 'unauth_audit'

export interface RateLimitRule {
  /** Maximum calls permitted inside the window. */
  limit: number
  /** Trailing window, in seconds. */
  windowSeconds: number
  /** Why this bucket keys the way it does — see RATE_LIMITS below. */
  keyedOn: string
}

export const RATE_LIMITS: Record<RateLimitBucket, RateLimitRule> = {
  /**
   * Sits beside — not instead of — Milestone 03's per-identifier login
   * throttle. That one stops password-guessing against ONE account; this one
   * stops a single source spraying one password across MANY accounts, which
   * the per-identifier check cannot see because no individual account
   * accumulates failures.
   */
  login: { limit: 20, windowSeconds: 15 * 60, keyedOn: 'client IP' },

  /**
   * Tighter than login because the cost profile is different: each call
   * sends an email. Unthrottled, this is a free way to bomb an inbox and to
   * burn the deployment's Resend quota.
   */
  login_reset: { limit: 5, windowSeconds: 60 * 60, keyedOn: 'client IP' },

  /**
   * Applied only AFTER the Paystack HMAC check, so this governs
   * legitimately-signed retry storms rather than anonymous flooding (an
   * unsigned flood is already rejected before any I/O). The existing
   * webhook_events idempotency ledger makes a 429'd retry safe to replay.
   */
  webhook: { limit: 120, windowSeconds: 60, keyedOn: 'client IP' },

  /**
   * Keyed on the cashier's user id, and this is the one threshold where the
   * key choice matters more than the number. A busy supermarket runs many
   * tills behind ONE NAT'd public IP, so an IP key would let one fast lane
   * throttle the whole store, and an organization key would be worse still.
   *
   * 120 sales/minute per cashier is ~2/sec sustained — unreachable by a
   * human scanning and taking payment, trivially reached by a runaway client
   * loop or a replayed token. The limit exists to catch the latter without
   * ever being felt by the former.
   */
  checkout: { limit: 120, windowSeconds: 60, keyedOn: 'authenticated user id' },

  /**
   * Enforced inside record_unauthenticated_audit_event() itself, not by this
   * module — a TypeScript check would be bypassed by calling the RPC
   * directly with the public anon key, which is the whole threat it exists
   * to close. Declared here so all five thresholds stay comparable in one
   * place; keep in sync with
   * 20260826090200_create_auth_audit_event_function.sql if it is ever tuned.
   */
  unauth_audit: { limit: 30, windowSeconds: 60, keyedOn: 'client IP (enforced in SQL)' },
}
