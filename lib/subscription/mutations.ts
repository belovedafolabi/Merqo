import { recordAuditEvent } from '@/lib/auth/audit'
import { requirePermission } from '@/lib/auth/guard'
import { toMinorUnits } from '@/lib/subscription/periods'
import { newPaymentReference } from '@/lib/paystack/reference'
import { resolvePaystackTransport } from '@/lib/paystack/service'
import { createServerSupabaseClient } from '@/lib/supabase/server'

import {
  setPriceInputSchema,
  initiateCheckoutInputSchema,
  confirmPaymentInputSchema,
  type SetPriceInput,
  type InitiateCheckoutInput,
  type ConfirmPaymentInput,
} from './schemas'
import { settlePaystackPayment, type SettlementOutcome } from './settlement'

/**
 * The subscription domain's writes. requirePermission() is a UX/error-
 * message convenience for updateSubscriptionPrice() and
 * initiateSubscriptionCheckout() — the actual boundary for both is the
 * permission check inside the RPC they call (set_subscription_price /
 * initiate_subscription_payment, 20260825100600), which runs regardless of
 * what this module does. For confirmSubscriptionPayment(), by contrast,
 * requirePermission() IS load-bearing: it is the only check standing between
 * an authenticated request and settlePaystackPayment(), which holds a
 * service-role client with no RLS underneath it at all.
 */

export async function updateSubscriptionPrice(
  organizationId: string,
  rawInput: SetPriceInput,
): Promise<void> {
  const input = setPriceInputSchema.parse(rawInput)
  const user = await requirePermission('platform.manage_pricing', { organizationId })

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.rpc('set_subscription_price', {
    p_billing_period: input.billingPeriod,
    p_price_minor: toMinorUnits(input.priceMajor),
    p_currency: input.currency,
  })
  if (error) throw error

  // The RPC already records its own audit event (20260825100600) — no
  // second call needed here, unlike lib/roles/mutations.ts's pattern, since
  // set_subscription_price() has everything it needs (actor, organization)
  // without a round trip back out to application code.
  void user
}

export interface CheckoutInitiationResult {
  authorizationUrl: string
  reference: string
}

/**
 * Starts a checkout: resolves the price SERVER-SIDE (never from the form —
 * a tampered client could otherwise request any billing_period at any
 * price), writes the PENDING subscription_payments row, then calls
 * Paystack. If Paystack itself is unreachable or unconfigured, the PENDING
 * row is left as-is; a stuck PENDING row is harmless (subscription_payments_
 * pending_idx exists for exactly this kind of diagnostic scan) since nothing
 * downstream trusts a payment's existence, only its SUCCESS transition.
 */
export async function initiateSubscriptionCheckout(
  organizationId: string,
  rawInput: InitiateCheckoutInput,
): Promise<CheckoutInitiationResult> {
  const input = initiateCheckoutInputSchema.parse(rawInput)
  const user = await requirePermission('subscription.renew', { organizationId })

  const transport = resolvePaystackTransport()
  if (!transport) {
    throw new Error('Online payment is not configured for this deployment.')
  }

  const supabase = await createServerSupabaseClient()
  const reference = newPaymentReference(organizationId)

  const { data, error } = await supabase.rpc('initiate_subscription_payment', {
    p_organization_id: organizationId,
    p_billing_period: input.billingPeriod,
    p_reference: reference,
  })
  if (error) throw error

  const row = (Array.isArray(data) ? data[0] : data) as {
    payment_id: string
    amount_minor: number
    currency: string
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')

  const result = await transport.initializeTransaction({
    reference,
    amountMinor: row.amount_minor,
    currency: row.currency,
    email: user.email ?? '',
    callbackUrl: `${appUrl}/settings/subscription`,
    metadata: { organizationId, billingPeriod: input.billingPeriod },
  })

  await supabase.rpc('record_payment_authorization_url', {
    p_payment_id: row.payment_id,
    p_authorization_url: result.authorizationUrl,
  })

  return { authorizationUrl: result.authorizationUrl, reference }
}

/**
 * The post-checkout browser callback's confirmation path. Funnels through
 * the SAME settlePaystackPayment() the webhook uses (settlement.ts) — they
 * cannot diverge, and whichever of the two arrives second is a no-op by
 * construction (apply_subscription_payment()'s PENDING -> SUCCESS guard).
 */
export async function confirmSubscriptionPayment(
  organizationId: string,
  rawInput: ConfirmPaymentInput,
): Promise<SettlementOutcome> {
  const input = confirmPaymentInputSchema.parse(rawInput)
  const actor = await requirePermission('subscription.renew', { organizationId })

  const outcome = await settlePaystackPayment(input.reference)

  if (outcome.outcome === 'extended') {
    await recordAuditEvent(
      {
        organizationId,
        userId: actor.id,
        action: 'subscription.confirmed_by_owner',
        resourceType: 'subscription_payment',
        resourceId: outcome.paymentId,
      },
      await createServerSupabaseClient(),
    )
  }

  return outcome
}
