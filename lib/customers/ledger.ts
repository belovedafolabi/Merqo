/**
 * The shared, pure ledger math for this milestone's two financial
 * mechanisms — same role and same discipline as lib/sales/calculations.ts:
 * no DB, no `async`, every function a plain value-in/value-out transform,
 * unit-tested in tests/unit/customers/ledger.test.ts without a database.
 *
 * This module exists because docs/milestones/09-customer-store-credit-and-
 * layaway.md is emphatic on one point: the ledger is the source of truth,
 * and a balance is always *derived* from it — "never stored/updated as a
 * single mutable number". `store_credit_accounts.balance` and
 * `layaways.amount_paid` are caches maintained inside
 * record_store_credit_entry()/record_layaway_payment()
 * (supabase/migrations/20260823130700_create_customer_functions.sql) in the
 * same transaction as the entry that justifies them; the functions below
 * are the independent derivation those caches are checked against, both in
 * the integration suite and anywhere a caller would rather compute from
 * entries it already has than issue a second query.
 *
 * Money is rounded to 2 decimal places at the point it's produced, the same
 * reasoning lib/sales/calculations.ts documents: intermediate float drift
 * must never accumulate into a visibly wrong balance.
 */

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/**
 * One `store_credit_ledger` row, reduced to what the math needs. `amount`
 * is signed at the database level (positive = issued, negative = spent —
 * see 20260823130200_create_store_credit_ledger.sql), which is exactly why
 * deriving a balance is a sum rather than a per-entry-type interpretation.
 */
export interface StoreCreditEntry {
  amount: number
}

/** The derived balance: literally `sum(amount)`, floored at 0. */
export function deriveStoreCreditBalance(entries: StoreCreditEntry[]): number {
  return round2(
    Math.max(
      0,
      entries.reduce((sum, entry) => sum + entry.amount, 0),
    ),
  )
}

/**
 * Whether a balance covers an amount, to the cent.
 *
 * Store credit is all-or-nothing at checkout (Milestone 08 excludes split
 * payments, so a sale is paid by exactly one method): a balance that cannot
 * cover the whole total fails the sale rather than part-paying it. Used by
 * the checkout UI to disable submission early — create_sale() re-validates
 * server-side under a row lock regardless, since a client-side check can
 * always be stale or skipped.
 */
export function canCoverAmount(balance: number, amount: number): boolean {
  return round2(balance) >= round2(amount)
}

/** One `layaway_payments` row, reduced to what the math needs. */
export interface LayawayPaymentEntry {
  amount: number
}

/** The derived amount paid: `sum(amount)` across every installment. */
export function deriveLayawayAmountPaid(payments: LayawayPaymentEntry[]): number {
  return round2(payments.reduce((sum, payment) => sum + payment.amount, 0))
}

/**
 * What is still owed. Floored at 0 so a (database-rejected, but defensively
 * handled) overpayment can never render as a negative "outstanding".
 */
export function deriveLayawayOutstanding(
  totalAmount: number,
  payments: LayawayPaymentEntry[],
): number {
  return round2(Math.max(0, totalAmount - deriveLayawayAmountPaid(payments)))
}

/**
 * A layaway is complete only when nothing is outstanding (this milestone's
 * FR: "the layaway is marked complete only when the outstanding balance
 * reaches zero"). Kept as a named predicate rather than an inline
 * `outstanding === 0` at each call site so the UI, the queries, and the
 * tests all agree on what "complete" means to the cent.
 */
export function isLayawaySettled(totalAmount: number, payments: LayawayPaymentEntry[]): boolean {
  return deriveLayawayOutstanding(totalAmount, payments) === 0
}
