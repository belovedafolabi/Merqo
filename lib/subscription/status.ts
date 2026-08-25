/**
 * Pure display-status logic — the TS mirror of
 * organization_access_permitted()/subscription_access_state()'s SQL
 * predicate in 20260825100500. DISPLAY ONLY: the database is the
 * enforcement boundary regardless of what this module computes, exactly as
 * that migration's own comment states. Used for rendering (the expiry
 * banner's copy, the pricing/status screens) where a round trip to
 * subscription_access_state() has already supplied the raw period_end.
 */

export type SubscriptionStatus = 'ACTIVE' | 'EXPIRING' | 'EXPIRED'

/** Mirrors run_subscription_daily_sweep()'s (20260825100700) EXPIRING window. */
export const EXPIRY_WARNING_DAYS = 7

export function resolveSubscriptionStatus(
  periodEnd: Date,
  now: Date = new Date(),
): SubscriptionStatus {
  const msRemaining = periodEnd.getTime() - now.getTime()
  if (msRemaining <= 0) return 'EXPIRED'

  const daysRemaining = msRemaining / (1000 * 60 * 60 * 24)
  if (daysRemaining <= EXPIRY_WARNING_DAYS) return 'EXPIRING'

  return 'ACTIVE'
}

/**
 * Whole days remaining until `periodEnd`, rounded up — "1 day remaining"
 * covers any moment still within that last day, matching
 * subscription_access_state()'s `ceil(extract(epoch from ...) / 86400)`.
 */
export function daysUntilExpiry(periodEnd: Date, now: Date = new Date()): number {
  const msRemaining = periodEnd.getTime() - now.getTime()
  return Math.ceil(msRemaining / (1000 * 60 * 60 * 24))
}
