'use server'

import { revalidatePath } from 'next/cache'

import { updateSubscriptionPrice } from '@/lib/subscription/mutations'
import type { BillingPeriod } from '@/lib/subscription/periods'

/**
 * Thin Server Action layer for the Super Admin pricing screen — same shape
 * as every domain since Milestone 10. requirePermission() inside
 * updateSubscriptionPrice() (via set_subscription_price()) is a UX
 * convenience; the RLS-equivalent boundary is that RPC's own permission
 * check, run regardless of what this action does.
 */
export interface PricingActionState {
  error: string | null
}

const initialState: PricingActionState = { error: null }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

export async function updatePriceAction(
  _prevState: PricingActionState,
  formData: FormData,
): Promise<PricingActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')

  try {
    await updateSubscriptionPrice(organizationId, {
      // Trust-then-validate cast, same convention
      // updateReceiptSettingsAction's templateId uses — setPriceInputSchema's
      // z.enum() inside the mutation is the actual validation.
      billingPeriod: String(formData.get('billingPeriod') ?? '') as BillingPeriod,
      priceMajor: Number(formData.get('priceMajor') ?? 0),
      currency: String(formData.get('currency') ?? 'NGN'),
    })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/settings/pricing')
  revalidatePath('/settings/subscription')
  return initialState
}
