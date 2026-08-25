import type { SupabaseClient } from '@supabase/supabase-js'

import { logger } from '@/lib/logger'
import { createServerSupabaseClient } from '@/lib/supabase/server'

import { deliverNotificationEmails, type NotifyResult } from './service'

interface NotifyLowStockRow {
  notification_id: string
  user_id: string
  email: string
  full_name: string
  email_enabled: boolean
  product_name: string
  sku: string | null
  branch_name: string
  quantity: string | number
  threshold: string | number
  href: string
}

/**
 * The fan-out entry point Milestone 07's producers call, per the milestone's
 * required event set. Calls public.notify_low_stock()
 * (20260824100400_create_notification_functions.sql) — the SECURITY DEFINER
 * function that resolves recipients, applies preferences, and inserts the
 * deduped in-app rows — then emails the subset with email_enabled = true.
 *
 * NEVER THROWS. Called from lib/inventory/mutations.ts and
 * lib/sales/mutations.ts strictly AFTER their own RPC
 * (record_inventory_movement / execute_stock_transfer / create_sale) has
 * already committed, so nothing here can roll back the business operation —
 * and the never-throws contract on top of that means the call site does not
 * even need a try/catch.
 *
 * `supabaseClient` is the same injected-client seam as
 * recordAuditEvent(event, supabaseClient?) — accepting one lets a unit test
 * drive this against a fake client without vi.mock().
 */
export async function notifyLowStock(
  input: { organizationId: string; branchId: string; productIds: readonly string[] },
  supabaseClient?: SupabaseClient,
): Promise<NotifyResult> {
  try {
    const supabase = supabaseClient ?? (await createServerSupabaseClient())

    const { data, error } = await supabase.rpc('notify_low_stock', {
      p_branch_id: input.branchId,
      p_product_ids: input.productIds.length > 0 ? input.productIds : null,
    })
    if (error) throw error

    const rows = (data ?? []) as NotifyLowStockRow[]
    const emailable = rows.filter((row) => row.email_enabled)

    return await deliverNotificationEmails(
      emailable,
      (row) => ({
        type: 'inventory.low_stock',
        data: {
          productName: row.product_name,
          sku: row.sku,
          branchName: row.branch_name,
          quantity: Number(row.quantity),
          threshold: Number(row.threshold),
          href: row.href,
        },
      }),
      rows.length,
    )
  } catch (error) {
    // The RPC call itself failed (network, a branch-access denial, a schema
    // mismatch) — distinct from an individual email failing, which
    // deliverNotificationEmails() already isolates per-recipient. Either way
    // this function's contract is the same: log, never throw.
    const reason = error instanceof Error ? error.message : String(error)
    logger.error('notification.delivery_failed', {
      type: 'inventory.low_stock',
      branchId: input.branchId,
      reason,
    })
    return { inAppCreated: 0, emailsSent: 0, emailsFailed: 0 }
  }
}
