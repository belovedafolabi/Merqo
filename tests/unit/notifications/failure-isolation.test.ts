import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetEmailTransport } from '@/lib/email/service'
import { notifyLowStock } from '@/lib/notifications/low-stock'

/**
 * Testing Requirement 3: "a simulated Resend API failure does not roll back
 * or fail the triggering business operation." lib/inventory/mutations.ts and
 * lib/sales/mutations.ts call notifyLowStock() with a plain `await` and no
 * try/catch — the argument these tests make concrete is that this is safe
 * BECAUSE notifyLowStock() provably never rejects, not because the call
 * sites happen to be careful. The movement/sale RPC has already committed,
 * in a separate transaction, before notifyLowStock() is even called — see
 * 20260824100400_create_notification_functions.sql's header for why that
 * ordering is the real isolation and this contract is the second layer on
 * top of it.
 */

function fakeSupabase(
  rpcImpl: (fn: string, params: unknown) => Promise<{ data: unknown; error: unknown }>,
) {
  return { rpc: vi.fn(rpcImpl) } as unknown as SupabaseClient
}

const LOW_STOCK_ROW = {
  notification_id: 'notif-1',
  user_id: 'user-1',
  email: 'owner@example.com',
  full_name: 'Owner',
  email_enabled: true,
  product_name: 'Widget',
  sku: 'W-1',
  branch_name: 'Main',
  quantity: 2,
  threshold: 10,
  href: '/inventory?branchId=abc',
}

describe('lib/notifications/low-stock — failure isolation', () => {
  const originalKey = process.env.RESEND_API_KEY
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetEmailTransport()
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    if (originalKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = originalKey
    resetEmailTransport()
  })

  it('a rejected email send resolves (never rejects) and tallies the failure', async () => {
    process.env.RESEND_API_KEY = 're_invalid'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unreachable')))

    const supabase = fakeSupabase(async () => ({ data: [LOW_STOCK_ROW], error: null }))

    await expect(
      notifyLowStock(
        { organizationId: 'org-1', branchId: 'branch-1', productIds: ['product-1'] },
        supabase,
      ),
    ).resolves.toEqual({ inAppCreated: 1, emailsSent: 0, emailsFailed: 1 })

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('notification.email_failed'))
  })

  it('the RPC call itself failing also resolves (never rejects), with a zero tally', async () => {
    const supabase = fakeSupabase(async () => ({
      data: null,
      error: new Error('permission denied'),
    }))

    await expect(
      notifyLowStock(
        { organizationId: 'org-1', branchId: 'branch-1', productIds: ['product-1'] },
        supabase,
      ),
    ).resolves.toEqual({ inAppCreated: 0, emailsSent: 0, emailsFailed: 0 })

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('notification.delivery_failed'))
  })

  it('routes by email_enabled: every row counts toward inAppCreated, only the emailable subset is sent', async () => {
    process.env.RESEND_API_KEY = 're_test_key'
    const fetchSpy = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ id: 'email_123' }) })
    vi.stubGlobal('fetch', fetchSpy)

    const supabase = fakeSupabase(async () => ({
      data: [
        LOW_STOCK_ROW,
        { ...LOW_STOCK_ROW, notification_id: 'notif-2', user_id: 'user-2', email_enabled: false },
      ],
      error: null,
    }))

    const result = await notifyLowStock(
      { organizationId: 'org-1', branchId: 'branch-1', productIds: ['product-1'] },
      supabase,
    )

    expect(result).toEqual({ inAppCreated: 2, emailsSent: 1, emailsFailed: 0 })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
