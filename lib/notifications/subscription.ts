import type { SupabaseClient } from '@supabase/supabase-js'

import { logger } from '@/lib/logger'
import { createServerSupabaseClient } from '@/lib/supabase/server'

import { deliverNotificationEmails, type NotifyResult } from './service'

/**
 * The fan-out entry points for the three subscription events, modelled
 * line-for-line on lib/notifications/low-stock.ts. NEVER THROW. `supabase`
 * is the same injected-client seam recordAuditEvent()/notifyLowStock() use —
 * needed here in particular because run_subscription_daily_sweep()'s caller
 * (lib/subscription/sweep.ts) and settlePaystackPayment()
 * (lib/subscription/settlement.ts) both hold a service-role client, not a
 * per-request session one.
 */

interface ExpiringRow {
  notification_id: string
  user_id: string
  email: string
  full_name: string
  email_enabled: boolean
  organization_name: string
  days_remaining: number
  current_period_end: string
  price_minor: number
  currency: string
  href: string
}

export async function notifySubscriptionExpiring(
  organizationId: string,
  supabaseClient?: SupabaseClient,
): Promise<NotifyResult> {
  try {
    const supabase = supabaseClient ?? (await createServerSupabaseClient())
    const { data, error } = await supabase.rpc('notify_subscription_expiring', {
      p_organization_id: organizationId,
    })
    if (error) throw error

    const rows = (data ?? []) as ExpiringRow[]
    const emailable = rows.filter((row) => row.email_enabled)

    return await deliverNotificationEmails(
      emailable,
      (row) => ({
        type: 'subscription.expiring',
        data: {
          organizationName: row.organization_name,
          daysRemaining: row.days_remaining,
          currentPeriodEnd: row.current_period_end,
          priceMinor: row.price_minor,
          currency: row.currency,
          href: row.href,
        },
      }),
      rows.length,
    )
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    logger.error('notification.delivery_failed', {
      type: 'subscription.expiring',
      organizationId,
      reason,
    })
    return { inAppCreated: 0, emailsSent: 0, emailsFailed: 0 }
  }
}

interface ExpiredRow {
  notification_id: string
  user_id: string
  email: string
  full_name: string
  email_enabled: boolean
  organization_name: string
  current_period_end: string
  href: string
}

export async function notifySubscriptionExpired(
  organizationId: string,
  supabaseClient?: SupabaseClient,
): Promise<NotifyResult> {
  try {
    const supabase = supabaseClient ?? (await createServerSupabaseClient())
    const { data, error } = await supabase.rpc('notify_subscription_expired', {
      p_organization_id: organizationId,
    })
    if (error) throw error

    const rows = (data ?? []) as ExpiredRow[]
    const emailable = rows.filter((row) => row.email_enabled)

    return await deliverNotificationEmails(
      emailable,
      (row) => ({
        type: 'subscription.expired',
        data: { organizationName: row.organization_name, href: row.href },
      }),
      rows.length,
    )
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    logger.error('notification.delivery_failed', {
      type: 'subscription.expired',
      organizationId,
      reason,
    })
    return { inAppCreated: 0, emailsSent: 0, emailsFailed: 0 }
  }
}

interface RenewedRow {
  notification_id: string
  user_id: string
  email: string
  full_name: string
  email_enabled: boolean
  organization_name: string
  new_period_end: string
  href: string
}

export async function notifySubscriptionRenewed(
  paymentId: string,
  supabaseClient?: SupabaseClient,
): Promise<NotifyResult> {
  try {
    const supabase = supabaseClient ?? (await createServerSupabaseClient())
    const { data, error } = await supabase.rpc('notify_subscription_renewed', {
      p_payment_id: paymentId,
    })
    if (error) throw error

    const rows = (data ?? []) as RenewedRow[]
    const emailable = rows.filter((row) => row.email_enabled)

    return await deliverNotificationEmails(
      emailable,
      (row) => ({
        type: 'subscription.renewed',
        data: {
          organizationName: row.organization_name,
          newPeriodEnd: row.new_period_end,
          href: row.href,
        },
      }),
      rows.length,
    )
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    logger.error('notification.delivery_failed', {
      type: 'subscription.renewed',
      paymentId,
      reason,
    })
    return { inAppCreated: 0, emailsSent: 0, emailsFailed: 0 }
  }
}
