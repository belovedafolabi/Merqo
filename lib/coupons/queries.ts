import { createServerSupabaseClient } from '@/lib/supabase/server'
import { calculateDiscount } from '@/lib/sales/calculations'
import type { Coupon } from '@/lib/coupons/schemas'

/**
 * Read side for coupons. RLS (`coupons_select`, 20260904090300 — any org
 * member) is the visibility boundary; these functions are for row mapping and
 * for the one piece of shared redemption logic (`findRedeemableCoupon`) that
 * both the POS "apply coupon" action and the authoritative check in
 * lib/sales/mutations.ts run.
 */

export type { Coupon } from '@/lib/coupons/schemas'

interface CouponRow {
  id: string
  code: string
  discount_type: 'percentage' | 'fixed'
  discount_value: string | number
  minimum_purchase: string | number
  max_redemptions: number | null
  redemption_count: number
  starts_at: string | null
  expires_at: string | null
  archived_at: string | null
  created_at: string
}

const SELECT_COLUMNS =
  'id, code, discount_type, discount_value, minimum_purchase, max_redemptions, redemption_count, starts_at, expires_at, archived_at, created_at'

function mapCoupon(row: CouponRow): Coupon {
  return {
    id: row.id,
    code: row.code,
    discountType: row.discount_type,
    discountValue: Number(row.discount_value),
    minimumPurchase: Number(row.minimum_purchase),
    maxRedemptions: row.max_redemptions,
    redemptionCount: row.redemption_count,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
  }
}

/** Every coupon for the org, live ones first, newest first. */
export async function listCoupons(organizationId: string): Promise<Coupon[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('coupons')
    .select(SELECT_COLUMNS)
    .eq('organization_id', organizationId)
    .order('archived_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false })

  if (error) throw error
  return ((data ?? []) as unknown as CouponRow[]).map(mapCoupon)
}

export type RedeemableCoupon =
  | { ok: true; coupon: Coupon; discountAmount: number }
  | { ok: false; reason: string }

/**
 * Resolve a code to a redeemable coupon for a sale of `subtotal`, or a
 * plain-language reason it can't be used. The create_sale() RPC re-runs the
 * same gates under a row lock (that is the authoritative, race-free check and
 * the redemption-count increment); this is the friendly pre-check that keeps
 * a bad code from ever reaching checkout.
 */
export async function findRedeemableCoupon(
  organizationId: string,
  code: string,
  subtotal: number,
): Promise<RedeemableCoupon> {
  const normalized = code.trim().toUpperCase()
  if (!normalized) return { ok: false, reason: 'Enter a coupon code.' }

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('coupons')
    .select(SELECT_COLUMNS)
    .eq('organization_id', organizationId)
    .is('archived_at', null)
    .ilike('code', normalized)
    .maybeSingle<CouponRow>()

  if (error) throw error
  if (!data) return { ok: false, reason: `No active coupon “${normalized}”.` }

  const coupon = mapCoupon(data)
  const now = Date.now()

  if (coupon.startsAt && now < new Date(coupon.startsAt).getTime()) {
    return { ok: false, reason: `Coupon “${coupon.code}” isn’t active yet.` }
  }
  if (coupon.expiresAt && now >= new Date(coupon.expiresAt).getTime()) {
    return { ok: false, reason: `Coupon “${coupon.code}” has expired.` }
  }
  if (
    coupon.maxRedemptions !== null &&
    coupon.redemptionCount >= coupon.maxRedemptions
  ) {
    return { ok: false, reason: `Coupon “${coupon.code}” has reached its redemption limit.` }
  }
  if (subtotal < coupon.minimumPurchase) {
    return {
      ok: false,
      reason: `Coupon “${coupon.code}” needs a minimum spend of ₦${coupon.minimumPurchase.toLocaleString('en-NG')}.`,
    }
  }

  const discountAmount = calculateDiscount(
    subtotal,
    coupon.discountType === 'percentage'
      ? { percentage: coupon.discountValue }
      : { amount: coupon.discountValue },
  )
  if (discountAmount <= 0) {
    return { ok: false, reason: `Coupon “${coupon.code}” has no effect on this sale.` }
  }

  return { ok: true, coupon, discountAmount }
}
