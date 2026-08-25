import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Unit-level coverage of settlePaystackPayment()'s decision logic, with the
 * Paystack transport and the service-role Supabase client both faked — the
 * full, real-database version of this flow is
 * tests/integration/subscription-webhook.test.ts. This file exists
 * specifically for the amount/currency mismatch branch, which is much
 * cheaper to prove here than by seeding a real mismatched payment row.
 *
 * The pending-row lookup goes through the get_subscription_payment_for_settlement
 * RPC (not a direct .from().select()) — see settlement.ts's own comment for
 * why (subscription_payments has no SELECT grant to service_role) — so
 * rpcMock's implementation branches on the RPC name to return either a
 * chainable (.maybeSingle()) result for that lookup, or a plain awaitable
 * result for apply_subscription_payment()/fail_subscription_payment().
 */

const verifyTransactionMock = vi.fn()
const resolvePaystackTransportMock = vi.fn()
const notifySubscriptionRenewedMock = vi.fn()

vi.mock('@/lib/paystack/service', () => ({
  resolvePaystackTransport: () => resolvePaystackTransportMock(),
}))
vi.mock('@/lib/notifications/subscription', () => ({
  notifySubscriptionRenewed: (...args: unknown[]) => notifySubscriptionRenewedMock(...args),
}))

const rpcMock = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createServiceRoleSupabaseClient: () => ({ rpc: rpcMock }),
}))

let pendingRow: { amount_minor: number; currency: string; status: string } | null = null
let mutationResult: { data: unknown; error: unknown } = { data: null, error: null }

function mockPendingRow(row: { amount_minor: number; currency: string; status: string } | null) {
  pendingRow = row
}

function mockMutationResult(result: { data: unknown; error: unknown }) {
  mutationResult = result
}

beforeEach(() => {
  pendingRow = null
  mutationResult = { data: null, error: null }
  rpcMock.mockImplementation((name: string) => {
    if (name === 'get_subscription_payment_for_settlement') {
      return { maybeSingle: () => Promise.resolve({ data: pendingRow, error: null }) }
    }
    return Promise.resolve(mutationResult)
  })
})

describe('settlePaystackPayment', () => {
  beforeEach(() => {
    vi.resetModules()
    resolvePaystackTransportMock.mockReturnValue({ verifyTransaction: verifyTransactionMock })
    verifyTransactionMock.mockReset()
    notifySubscriptionRenewedMock.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns "unavailable" without extending when Paystack is not configured', async () => {
    resolvePaystackTransportMock.mockReturnValue(null)
    const { settlePaystackPayment } = await import('@/lib/subscription/settlement')

    const result = await settlePaystackPayment('sub_ref_1')
    expect(result.outcome).toBe('unavailable')
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('returns "unavailable" when the verify call itself throws (network failure)', async () => {
    verifyTransactionMock.mockRejectedValue(new Error('ECONNRESET'))
    const { settlePaystackPayment } = await import('@/lib/subscription/settlement')

    const result = await settlePaystackPayment('sub_ref_1')
    expect(result.outcome).toBe('unavailable')
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('returns "rejected" and calls fail_subscription_payment when the amount does not match', async () => {
    mockPendingRow({ amount_minor: 500000, currency: 'NGN', status: 'PENDING' })
    verifyTransactionMock.mockResolvedValue({
      reference: 'sub_ref_1',
      status: 'success',
      amountMinor: 100, // mismatched — Paystack confirms a far smaller amount
      currency: 'NGN',
      transactionId: 1,
      paidAt: null,
      raw: {},
    })
    mockMutationResult({ data: true, error: null })
    const { settlePaystackPayment } = await import('@/lib/subscription/settlement')

    const result = await settlePaystackPayment('sub_ref_1')
    expect(result.outcome).toBe('rejected')
    expect(rpcMock).toHaveBeenCalledWith('fail_subscription_payment', expect.anything())
  })

  it('returns "rejected" when Paystack reports a non-success status', async () => {
    mockPendingRow({ amount_minor: 500000, currency: 'NGN', status: 'PENDING' })
    verifyTransactionMock.mockResolvedValue({
      reference: 'sub_ref_1',
      status: 'failed',
      amountMinor: 500000,
      currency: 'NGN',
      transactionId: 1,
      paidAt: null,
      raw: {},
    })
    mockMutationResult({ data: true, error: null })
    const { settlePaystackPayment } = await import('@/lib/subscription/settlement')

    const result = await settlePaystackPayment('sub_ref_1')
    expect(result.outcome).toBe('rejected')
  })

  it('returns "duplicate" without calling Paystack verify again when the row is already SUCCESS', async () => {
    mockPendingRow({ amount_minor: 500000, currency: 'NGN', status: 'SUCCESS' })
    verifyTransactionMock.mockResolvedValue({
      reference: 'sub_ref_1',
      status: 'success',
      amountMinor: 500000,
      currency: 'NGN',
      transactionId: 1,
      paidAt: null,
      raw: {},
    })
    const { settlePaystackPayment } = await import('@/lib/subscription/settlement')

    const result = await settlePaystackPayment('sub_ref_1')
    expect(result.outcome).toBe('duplicate')
    expect(rpcMock).not.toHaveBeenCalledWith('apply_subscription_payment', expect.anything())
  })

  it('returns "rejected" when the reference is unknown (no pending row)', async () => {
    mockPendingRow(null)
    verifyTransactionMock.mockResolvedValue({
      reference: 'sub_ref_1',
      status: 'success',
      amountMinor: 500000,
      currency: 'NGN',
      transactionId: 1,
      paidAt: null,
      raw: {},
    })
    const { settlePaystackPayment } = await import('@/lib/subscription/settlement')

    const result = await settlePaystackPayment('sub_ref_1')
    expect(result.outcome).toBe('rejected')
  })

  it('extends and notifies when everything matches', async () => {
    mockPendingRow({ amount_minor: 500000, currency: 'NGN', status: 'PENDING' })
    verifyTransactionMock.mockResolvedValue({
      reference: 'sub_ref_1',
      status: 'success',
      amountMinor: 500000,
      currency: 'NGN',
      transactionId: 1,
      paidAt: '2026-08-25T00:00:00.000Z',
      raw: {},
    })
    mockMutationResult({
      data: [{ payment_id: 'pay_1', extended: true, new_period_end: '2026-09-25T00:00:00.000Z' }],
      error: null,
    })
    const { settlePaystackPayment } = await import('@/lib/subscription/settlement')

    const result = await settlePaystackPayment('sub_ref_1')
    expect(result).toMatchObject({ outcome: 'extended', paymentId: 'pay_1' })
    expect(notifySubscriptionRenewedMock).toHaveBeenCalledWith('pay_1', expect.anything())
  })
})
