import { createHmac, randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { pool } from './helpers/db'
import { bootstrapOrganization, createTestUser } from './helpers/supabase'

/**
 * Drives app/api/webhooks/paystack/route.ts's exported POST directly — the
 * real Route Handler, the real database, the real signature verification —
 * with only Paystack's own HTTP transport stubbed
 * (lib/paystack/transports/paystack.ts's createPaystackTransport is never
 * invoked; resolvePaystackTransport is mocked instead so no real network
 * call happens). This is the milestone's Testing Requirements: "an
 * invalid-signature webhook is rejected; a duplicate valid webhook does not
 * double-extend a subscription."
 */

const WEBHOOK_SECRET = 'sk_test_webhook_secret_for_ci'
process.env.PAYSTACK_SECRET_KEY = WEBHOOK_SECRET

const verifyTransactionMock = vi.fn()
vi.mock('@/lib/paystack/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/paystack/service')>()
  return {
    ...actual,
    resolvePaystackTransport: () => ({ verifyTransaction: verifyTransactionMock }),
  }
})

// Route Handlers invoked directly (bypassing Next's actual server, which
// establishes the AsyncLocalStorage request context) have no request scope
// for next/headers to read from — a purely test-harness limitation, not a
// production bug (in a real deployment this Route Handler runs inside a
// genuine request). Only the webhook's rejected-signature path reaches
// getRequestMeta() (via recordAuditEvent()), so a static stand-in is enough.
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
}))

function sign(body: string): string {
  return createHmac('sha512', WEBHOOK_SECRET).update(body, 'utf8').digest('hex')
}

// A fresh random id per call, NOT a fixed literal — webhook_events' unique
// (provider, event_id) constraint is keyed on eventType:transactionId
// (see app/api/webhooks/paystack/route.ts), and a hardcoded literal here
// would collide with a leftover row from any earlier run of this same file
// against a database that hasn't been reset in between, silently turning a
// "fresh event" test into a "known duplicate" one.
function randomTransactionId(): number {
  return Math.floor(Math.random() * 1_000_000_000)
}

function postWebhook(rawBody: string, signature: string | null) {
  const request = new NextRequest('http://localhost/api/webhooks/paystack', {
    method: 'POST',
    body: rawBody,
    headers: signature ? { 'x-paystack-signature': signature } : {},
  })
  return request
}

async function setupPendingPayment() {
  const suffix = randomUUID().slice(0, 8)
  const owner = await createTestUser()
  const { organizationId } = await bootstrapOrganization(owner, `Webhook${suffix}`)
  const reference = `sub_${suffix}_${randomUUID()}`

  const { data, error } = await owner.client
    .rpc('initiate_subscription_payment', {
      p_organization_id: organizationId,
      p_billing_period: 'MONTHLY',
      p_reference: reference,
    })
    .single()
  if (error) throw error

  return { organizationId, reference, ...(data as { amount_minor: number; currency: string }) }
}

afterAll(async () => {
  await pool.end()
})

describe('POST /api/webhooks/paystack', () => {
  afterEach(() => {
    verifyTransactionMock.mockReset()
  })

  it('rejects a tampered payload with 401 and makes no state change', async () => {
    const { reference } = await setupPendingPayment()
    const body = JSON.stringify({
      event: 'charge.success',
      data: { reference, id: randomTransactionId() },
    })
    const validSignature = sign(body)
    const tamperedBody = JSON.stringify({
      event: 'charge.success',
      data: { reference, id: randomTransactionId() },
    })

    const { POST } = await import('@/app/api/webhooks/paystack/route')
    const response = await POST(postWebhook(tamperedBody, validSignature))

    expect(response.status).toBe(401)
    expect(verifyTransactionMock).not.toHaveBeenCalled()

    const paymentRow = await pool.query(
      `select status from public.subscription_payments where paystack_reference = $1`,
      [reference],
    )
    expect(paymentRow.rows[0].status).toBe('PENDING')
  })

  it('rejects a missing signature header with 401', async () => {
    const body = JSON.stringify({
      event: 'charge.success',
      data: { reference: 'whatever', id: randomTransactionId() },
    })
    const { POST } = await import('@/app/api/webhooks/paystack/route')
    const response = await POST(postWebhook(body, null))
    expect(response.status).toBe(401)
  })

  it('a valid signature with a matching amount extends the subscription', async () => {
    const { organizationId, reference, amount_minor, currency } = await setupPendingPayment()
    const body = JSON.stringify({
      event: 'charge.success',
      data: { reference, id: randomTransactionId() },
    })
    const signature = sign(body)

    verifyTransactionMock.mockResolvedValue({
      reference,
      status: 'success',
      amountMinor: amount_minor,
      currency,
      transactionId: 555,
      paidAt: new Date().toISOString(),
      raw: {},
    })

    const { POST } = await import('@/app/api/webhooks/paystack/route')
    const response = await POST(postWebhook(body, signature))
    expect(response.status).toBe(200)

    const paymentRow = await pool.query(
      `select status from public.subscription_payments where paystack_reference = $1`,
      [reference],
    )
    expect(paymentRow.rows[0].status).toBe('SUCCESS')

    const subRow = await pool.query(
      `select current_period_end from public.subscriptions where organization_id = $1`,
      [organizationId],
    )
    expect(new Date(subRow.rows[0].current_period_end).getTime()).toBeGreaterThan(Date.now())
  }, 30_000) // full chain: signup + RPC + webhook + settlement + email fan-out — the default 15s is tight

  it('an exact replay of the same event is idempotent — does not double-extend', async () => {
    const { organizationId, reference, amount_minor, currency } = await setupPendingPayment()
    const body = JSON.stringify({
      event: 'charge.success',
      data: { reference, id: randomTransactionId() },
    })
    const signature = sign(body)

    verifyTransactionMock.mockResolvedValue({
      reference,
      status: 'success',
      amountMinor: amount_minor,
      currency,
      transactionId: 777,
      paidAt: new Date().toISOString(),
      raw: {},
    })

    const { POST } = await import('@/app/api/webhooks/paystack/route')
    const first = await POST(postWebhook(body, signature))
    expect(first.status).toBe(200)

    const afterFirst = await pool.query(
      `select current_period_end from public.subscriptions where organization_id = $1`,
      [organizationId],
    )

    // Exact replay: identical body and signature, same event id.
    const second = await POST(postWebhook(body, signature))
    const secondJson = await second.json()
    expect(second.status).toBe(200)
    expect(secondJson.duplicate).toBe(true)

    const afterSecond = await pool.query(
      `select current_period_end from public.subscriptions where organization_id = $1`,
      [organizationId],
    )
    expect(afterSecond.rows[0].current_period_end).toEqual(afterFirst.rows[0].current_period_end)
    // The verify call itself is never reached on a known-duplicate delivery.
    expect(verifyTransactionMock).toHaveBeenCalledTimes(1)
  })

  it('Paystack reporting a non-success status marks the payment FAILED, not extended', async () => {
    const { organizationId, reference, amount_minor, currency } = await setupPendingPayment()
    const body = JSON.stringify({
      event: 'charge.success',
      data: { reference, id: randomTransactionId() },
    })
    const signature = sign(body)

    verifyTransactionMock.mockResolvedValue({
      reference,
      status: 'failed',
      amountMinor: amount_minor,
      currency,
      transactionId: 888,
      paidAt: null,
      raw: {},
    })

    const { POST } = await import('@/app/api/webhooks/paystack/route')
    const response = await POST(postWebhook(body, signature))
    expect(response.status).toBe(200) // acknowledged; Paystack need not retry

    const paymentRow = await pool.query(
      `select status from public.subscription_payments where paystack_reference = $1`,
      [reference],
    )
    expect(paymentRow.rows[0].status).toBe('FAILED')

    const subRow = await pool.query(
      `select is_trial from public.subscriptions where organization_id = $1`,
      [organizationId],
    )
    expect(subRow.rows[0].is_trial).toBe(true) // untouched — still the original trial
  })

  it('a verify-call network failure returns 500 and leaves the webhook event RECEIVED (retryable)', async () => {
    const { reference } = await setupPendingPayment()
    const body = JSON.stringify({
      event: 'charge.success',
      data: { reference, id: randomTransactionId() },
    })
    const signature = sign(body)

    verifyTransactionMock.mockRejectedValue(new Error('ECONNRESET'))

    const { POST } = await import('@/app/api/webhooks/paystack/route')
    const response = await POST(postWebhook(body, signature))
    expect(response.status).toBe(500)

    const eventRow = await pool.query(
      `select status from public.webhook_events where reference = $1 order by received_at desc limit 1`,
      [reference],
    )
    expect(eventRow.rows[0].status).toBe('RECEIVED')
  })
})
