'use server'

import { revalidatePath } from 'next/cache'

import { toErrorMessage } from '@/lib/errors'
import { archiveCoupon, createCoupon, updateCoupon } from '@/lib/coupons/mutations'
import type { CouponInput } from '@/lib/coupons/schemas'

/**
 * Thin Server Action layer for Settings → Coupons — same shape as
 * app/(app)/settings/pricing/actions.ts. requirePermission('coupons.manage')
 * inside each mutation is the friendly gate; coupons_insert / coupons_update
 * (20260904090300) are the enforced boundary.
 */
export interface CouponsActionState {
  error: string | null
}

const initialState: CouponsActionState = { error: null }

/** Shape the raw form fields into CouponInput's types before the mutation parses them. */
function readCouponForm(formData: FormData): CouponInput {
  const num = (key: string): number => Number(formData.get(key) ?? 0)
  const optionalNum = (key: string): number | null => {
    const raw = String(formData.get(key) ?? '').trim()
    return raw === '' ? null : Number(raw)
  }
  const optionalDate = (key: string): string | null => {
    const raw = String(formData.get(key) ?? '').trim()
    return raw === '' ? null : raw
  }
  return {
    code: String(formData.get('code') ?? ''),
    discountType: String(formData.get('discountType') ?? 'percentage') as CouponInput['discountType'],
    discountValue: num('discountValue'),
    minimumPurchase: num('minimumPurchase'),
    maxRedemptions: optionalNum('maxRedemptions'),
    startsAt: optionalDate('startsAt'),
    expiresAt: optionalDate('expiresAt'),
  }
}

export async function createCouponAction(
  _prevState: CouponsActionState,
  formData: FormData,
): Promise<CouponsActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  try {
    await createCoupon(organizationId, readCouponForm(formData))
  } catch (error) {
    return { error: toErrorMessage(error) }
  }
  revalidatePath('/settings/coupons')
  return initialState
}

export async function updateCouponAction(
  _prevState: CouponsActionState,
  formData: FormData,
): Promise<CouponsActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const couponId = String(formData.get('couponId') ?? '')
  try {
    await updateCoupon(organizationId, couponId, readCouponForm(formData))
  } catch (error) {
    return { error: toErrorMessage(error) }
  }
  revalidatePath('/settings/coupons')
  return initialState
}

export async function archiveCouponAction(
  _prevState: CouponsActionState,
  formData: FormData,
): Promise<CouponsActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const couponId = String(formData.get('couponId') ?? '')
  try {
    await archiveCoupon(organizationId, couponId)
  } catch (error) {
    return { error: toErrorMessage(error) }
  }
  revalidatePath('/settings/coupons')
  return initialState
}
