import { recordAuditEvent } from '@/lib/auth/audit'
import { requirePermission } from '@/lib/auth/guard'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { couponInputSchema, type CouponInput } from '@/lib/coupons/schemas'

/**
 * Coupon writes. requirePermission('coupons.manage') here is the friendly
 * gate; the enforced boundary is coupons_insert / coupons_update
 * (20260904090300), which require the same key in their WITH CHECK — and, on
 * insert, `created_by = auth.uid()`, so a coupon can't be attributed to
 * anyone else. redemption_count is never touched here: only create_sale()
 * (SECURITY DEFINER) increments it, under a row lock.
 */

/** A calendar date → the instant its local day begins (UTC midnight). */
function startInstant(date: string | null): string | null {
  return date ? new Date(`${date}T00:00:00Z`).toISOString() : null
}

/** A calendar date → the instant the day AFTER begins, so "expires <date>"
 *  means the coupon is valid through the end of that day. */
function endInstant(date: string | null): string | null {
  if (!date) return null
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString()
}

function columnsFrom(input: CouponInput) {
  return {
    code: input.code,
    discount_type: input.discountType,
    discount_value: input.discountValue,
    minimum_purchase: input.minimumPurchase,
    max_redemptions: input.maxRedemptions,
    starts_at: startInstant(input.startsAt),
    expires_at: endInstant(input.expiresAt),
  }
}

export async function createCoupon(organizationId: string, rawInput: CouponInput): Promise<string> {
  const input = couponInputSchema.parse(rawInput)
  const user = await requirePermission('coupons.manage', { organizationId })

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('coupons')
    .insert({
      organization_id: organizationId,
      created_by: user.id,
      ...columnsFrom(input),
    })
    .select('id')
    .single<{ id: string }>()

  if (error) throw error

  await recordAuditEvent({
    organizationId,
    userId: user.id,
    action: 'coupon.created',
    resourceType: 'coupon',
    resourceId: data.id,
    metadata: { code: input.code, discountType: input.discountType, discountValue: input.discountValue },
  })

  return data.id
}

export async function updateCoupon(
  organizationId: string,
  couponId: string,
  rawInput: CouponInput,
): Promise<void> {
  const input = couponInputSchema.parse(rawInput)
  const user = await requirePermission('coupons.manage', { organizationId })

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('coupons')
    .update(columnsFrom(input))
    .eq('id', couponId)
    .eq('organization_id', organizationId)

  if (error) throw error

  await recordAuditEvent({
    organizationId,
    userId: user.id,
    action: 'coupon.updated',
    resourceType: 'coupon',
    resourceId: couponId,
    metadata: { code: input.code },
  })
}

export async function archiveCoupon(organizationId: string, couponId: string): Promise<void> {
  const user = await requirePermission('coupons.manage', { organizationId })

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('coupons')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', couponId)
    .eq('organization_id', organizationId)
    .is('archived_at', null)

  if (error) throw error

  await recordAuditEvent({
    organizationId,
    userId: user.id,
    action: 'coupon.archived',
    resourceType: 'coupon',
    resourceId: couponId,
  })
}
