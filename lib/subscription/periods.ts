/**
 * Pure billing-period arithmetic and formatting — no Supabase, no Next.js.
 * The four durations are the single source of truth the pricing screen, the
 * renew form, and the SQL check constraints (subscription_pricing/
 * subscriptions/subscription_payments.billing_period) all agree on.
 */

export const BILLING_PERIODS = [
  { value: 'MONTHLY', label: 'Monthly', months: 1 },
  { value: 'QUARTERLY', label: 'Quarterly', months: 3 },
  { value: 'SEMI_ANNUAL', label: 'Semi-Annual', months: 6 },
  { value: 'ANNUAL', label: 'Annual', months: 12 },
] as const

export type BillingPeriod = (typeof BILLING_PERIODS)[number]['value']

export function billingPeriodLabel(period: BillingPeriod): string {
  return BILLING_PERIODS.find((p) => p.value === period)?.label ?? period
}

/**
 * Adds one billing period to a date. Delegates month arithmetic to the
 * JS Date object's own month-overflow handling, which — like Postgres'
 * `+ interval '1 mon'` — rolls Jan 31 + 1 month to a valid date (Mar 3, since
 * JS Date normalizes overflow rather than clamping to Feb 28/29 the way
 * Postgres does). The SQL side (billing_period_interval() in
 * 20260825100600) is the actual extension boundary; this is the TS mirror
 * used only for display (e.g. "renews on ...") before the payment is
 * verified.
 */
export function addBillingPeriod(from: Date, period: BillingPeriod): Date {
  const months = BILLING_PERIODS.find((p) => p.value === period)?.months ?? 1
  const next = new Date(from)
  next.setUTCMonth(next.getUTCMonth() + months)
  return next
}

/**
 * Formats an integer minor-unit amount (kobo) as a major-unit currency
 * string, e.g. formatMinor(500000, 'NGN') -> "₦5,000.00".
 */
export function formatMinor(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency }).format(amountMinor / 100)
}

/** Converts a major-unit amount (e.g. a form input in Naira) to minor units (kobo). */
export function toMinorUnits(amountMajor: number): number {
  return Math.round(amountMajor * 100)
}
