import { cache } from 'react'

import { createServerSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/server'

import type { BillingPeriod } from './periods'

/**
 * Read-side queries for subscription status, pricing, and payment history.
 * RLS is the enforced boundary throughout — subscription_access_state() is
 * granted to authenticated and resolves the caller's own organization
 * server-side (20260825100500); the two table reads below are gated by the
 * subscription.view permission (20260825100800), same convention every
 * other queries.ts file in this codebase states about its own table.
 */

export interface SubscriptionAccessState {
  organizationId: string
  organizationName: string
  status: 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | null
  billingPeriod: BillingPeriod | null
  currentPeriodEnd: string | null
  daysRemaining: number | null
  priceMinor: number | null
  currency: string | null
  locked: boolean
  canRenew: boolean
  isPlatformAdmin: boolean
}

interface AccessStateRow {
  organization_id: string
  organization_name: string
  status: string | null
  billing_period: string | null
  current_period_end: string | null
  days_remaining: number | null
  price_minor: number | null
  currency: string | null
  locked: boolean
  can_renew: boolean
  is_platform_admin: boolean
}

/**
 * The single shared read the proxy, sign-in check, expiry banner, and locked
 * screen all use — see subscription_access_state()'s own comment
 * (20260825100500). cache()-memoized so every one of those call sites within
 * a single request shares one round trip.
 *
 * Returns null when unconfigured (mirrors getCurrentUser()'s stance) or when
 * the caller has no organization yet (mid-bootstrap, or unauthenticated) —
 * both are "nothing to lock" states, not errors.
 */
export const getSubscriptionAccessState = cache(
  async (): Promise<SubscriptionAccessState | null> => {
    if (!isSupabaseConfigured()) return null

    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.rpc('subscription_access_state').maybeSingle()
    if (error) throw error
    if (!data) return null

    const row = data as AccessStateRow
    return {
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      status: row.status as SubscriptionAccessState['status'],
      billingPeriod: row.billing_period as BillingPeriod | null,
      currentPeriodEnd: row.current_period_end,
      daysRemaining: row.days_remaining,
      priceMinor: row.price_minor,
      currency: row.currency,
      locked: row.locked,
      canRenew: row.can_renew,
      isPlatformAdmin: row.is_platform_admin,
    }
  },
)

export interface SubscriptionPriceOption {
  billingPeriod: BillingPeriod
  priceMinor: number
  currency: string
  isActive: boolean
}

interface PricingRow {
  billing_period: string
  price_minor: number
  currency: string
  is_active: boolean
}

/**
 * The full price list, active and inactive alike — the pricing config
 * screen needs to show every row so the Super Admin can re-activate one;
 * the renew form filters to isActive itself.
 */
export async function getSubscriptionPricing(): Promise<SubscriptionPriceOption[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.rpc('get_subscription_pricing')
  if (error) throw error

  return ((data ?? []) as PricingRow[]).map((row) => ({
    billingPeriod: row.billing_period as BillingPeriod,
    priceMinor: row.price_minor,
    currency: row.currency,
    isActive: row.is_active,
  }))
}

export interface SubscriptionPaymentSummary {
  id: string
  billingPeriod: BillingPeriod
  amountMinor: number
  currency: string
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'ABANDONED'
  createdAt: string
  verifiedAt: string | null
}

interface PaymentRow {
  id: string
  billing_period: string
  amount_minor: number
  currency: string
  status: string
  created_at: string
  verified_at: string | null
}

/** The Owner's subscription screen payment history table. Newest first, capped at 25 — this
 *  is a support/reference view, not a full ledger export (reports.export covers that domain). */
export async function listSubscriptionPayments(
  organizationId: string,
): Promise<SubscriptionPaymentSummary[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('subscription_payments')
    .select('id, billing_period, amount_minor, currency, status, created_at, verified_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(25)

  if (error) throw error

  return ((data ?? []) as PaymentRow[]).map((row) => ({
    id: row.id,
    billingPeriod: row.billing_period as BillingPeriod,
    amountMinor: row.amount_minor,
    currency: row.currency,
    status: row.status as SubscriptionPaymentSummary['status'],
    createdAt: row.created_at,
    verifiedAt: row.verified_at,
  }))
}
