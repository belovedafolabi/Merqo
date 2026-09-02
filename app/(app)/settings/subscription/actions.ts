'use server'

import { toErrorMessage } from '@/lib/errors'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import {
  confirmSubscriptionPayment,
  initiateSubscriptionCheckout,
} from '@/lib/subscription/mutations'
import type { BillingPeriod } from '@/lib/subscription/periods'

/**
 * Thin Server Action layer for the Owner subscription screen. Two actions:
 * start a checkout (redirects to Paystack's hosted page server-side, so the
 * authorization URL never round-trips through client state), and confirm a
 * payment on return (the browser-callback half of settlePaystackPayment() —
 * see lib/subscription/settlement.ts's doc for why this and the webhook
 * cannot diverge).
 */
export interface SubscriptionActionState {
  error: string | null
  notice?: string | null
}

function errorMessage(error: unknown): string {
  return toErrorMessage(error)
}

export async function initiateCheckoutAction(
  _prevState: SubscriptionActionState,
  formData: FormData,
): Promise<SubscriptionActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const billingPeriod = String(formData.get('billingPeriod') ?? '') as BillingPeriod

  let authorizationUrl: string
  try {
    const result = await initiateSubscriptionCheckout(organizationId, { billingPeriod })
    authorizationUrl = result.authorizationUrl
  } catch (error) {
    return { error: errorMessage(error) }
  }

  redirect(authorizationUrl)
}

export async function confirmPaymentAction(
  _prevState: SubscriptionActionState,
  formData: FormData,
): Promise<SubscriptionActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const reference = String(formData.get('reference') ?? '')

  try {
    const outcome = await confirmSubscriptionPayment(organizationId, { reference })

    if (outcome.outcome === 'extended') {
      revalidatePath('/settings/subscription')
      return { error: null, notice: 'Subscription renewed successfully.' }
    }
    if (outcome.outcome === 'duplicate') {
      revalidatePath('/settings/subscription')
      return { error: null, notice: 'This payment was already confirmed.' }
    }
    if (outcome.outcome === 'rejected') {
      return { error: `Payment could not be verified: ${outcome.reason}` }
    }
    return { error: 'Could not reach Paystack to verify this payment. Please try again shortly.' }
  } catch (error) {
    return { error: errorMessage(error) }
  }
}
