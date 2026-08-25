import { logger } from '@/lib/logger'
import { notifySubscriptionRenewed } from '@/lib/notifications/subscription'
import { resolvePaystackTransport } from '@/lib/paystack/service'
import { PaystackError } from '@/lib/paystack/types'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/admin'

/**
 * THE one code path from a Paystack reference to an extended subscription.
 * Both the webhook (app/api/webhooks/paystack/route.ts) and the post-
 * checkout browser callback (lib/subscription/mutations.ts's
 * confirmSubscriptionPayment()) call this SAME function — they cannot
 * diverge, and whichever arrives second is a no-op by construction, via
 * apply_subscription_payment()'s PENDING -> SUCCESS conditional update
 * (20260825100600).
 *
 * Holds a service-role client — see lib/supabase/admin.ts's doc comment for
 * why, and why this file is one of exactly two permitted importers.
 */

export type SettlementOutcome =
  | { outcome: 'extended'; paymentId: string; newPeriodEnd: string }
  | { outcome: 'duplicate'; paymentId: string }
  | { outcome: 'rejected'; reason: string }
  | { outcome: 'unavailable'; reason: string }

export async function settlePaystackPayment(reference: string): Promise<SettlementOutcome> {
  const transport = resolvePaystackTransport()
  if (!transport) {
    return { outcome: 'unavailable', reason: 'Paystack is not configured for this deployment.' }
  }

  const supabase = createServiceRoleSupabaseClient()

  let verification: Awaited<ReturnType<typeof transport.verifyTransaction>>
  try {
    verification = await transport.verifyTransaction(reference)
  } catch (error) {
    // The verify CALL ITSELF failed (network, Paystack 5xx, timeout) — Paystack
    // never actually adjudicated the payment, so this is 'unavailable', not
    // 'rejected': retrying later can still succeed. Distinct from Paystack
    // definitively answering "not successful", handled below.
    const reason = error instanceof PaystackError ? error.message : String(error)
    logger.error('subscription.verify_failed', { reference, reason })
    return { outcome: 'unavailable', reason }
  }

  // Look up what we expected BEFORE trusting Paystack's numbers — the
  // PENDING row (20260825100200) is the identity anchor; Paystack's payload
  // only ever confirms or contradicts it, never supplies it. Via an RPC, not
  // a direct .from().select() — subscription_payments has no SELECT grant
  // to service_role (every real read/write goes through a function), and a
  // direct table call here would fail permission-denied silently
  // (destructuring only `data`, as this used to, reads that as "no row
  // found" rather than "not allowed to look").
  const { data: pendingRow, error: pendingRowError } = await supabase
    .rpc('get_subscription_payment_for_settlement', { p_reference: reference })
    .maybeSingle<{ amount_minor: number; currency: string; status: string }>()

  if (pendingRowError) throw pendingRowError

  if (!pendingRow) {
    logger.error('subscription.settlement_unknown_reference', { reference })
    return { outcome: 'rejected', reason: 'Unknown payment reference.' }
  }

  if (pendingRow.status !== 'PENDING') {
    // Already settled by the other path (webhook vs. browser callback race,
    // or a genuine replay). Not an error — report it plainly.
    return { outcome: 'duplicate', paymentId: reference }
  }

  const amountMatches = verification.amountMinor === pendingRow.amount_minor
  const currencyMatches = verification.currency === pendingRow.currency

  if (verification.status !== 'success' || !amountMatches || !currencyMatches) {
    const reason =
      verification.status !== 'success'
        ? `Paystack reported status "${verification.status}".`
        : 'Paystack-confirmed amount/currency did not match the expected payment.'

    await supabase.rpc('fail_subscription_payment', {
      p_reference: reference,
      p_reason: reason,
      p_verification: verification.raw,
    })
    logger.warn('subscription.payment_rejected', { reference, reason })
    return { outcome: 'rejected', reason }
  }

  const { data, error } = await supabase.rpc('apply_subscription_payment', {
    p_reference: reference,
    p_transaction_id: verification.transactionId,
    p_amount_minor: verification.amountMinor,
    p_currency: verification.currency,
    p_verification: verification.raw,
  })
  if (error) throw error

  const row = (Array.isArray(data) ? data[0] : data) as {
    payment_id: string
    extended: boolean
    new_period_end: string
  }

  if (!row.extended) {
    return { outcome: 'duplicate', paymentId: row.payment_id }
  }

  // Post-commit, never-throws fan-out — same isolation reasoning as every
  // other notify_*() call site in this codebase.
  await notifySubscriptionRenewed(row.payment_id, supabase)

  return { outcome: 'extended', paymentId: row.payment_id, newPeriodEnd: row.new_period_end }
}
