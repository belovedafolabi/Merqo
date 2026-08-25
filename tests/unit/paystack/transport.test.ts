import { afterEach, describe, expect, it, vi } from 'vitest'

import { createPaystackTransport } from '@/lib/paystack/transports/paystack'
import { PaystackError } from '@/lib/paystack/types'

describe('createPaystackTransport', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('initializeTransaction sends amount in minor units and our own reference', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: true,
          message: 'ok',
          data: {
            authorization_url: 'https://checkout.paystack.com/abc',
            access_code: 'code_abc',
            reference: 'sub_abc123',
          },
        }),
        { status: 200 },
      ),
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const transport = createPaystackTransport('sk_test_key')
    const result = await transport.initializeTransaction({
      reference: 'sub_abc123',
      amountMinor: 500000,
      currency: 'NGN',
      email: 'owner@example.com',
      callbackUrl: 'https://app.example.com/settings/subscription',
    })

    expect(result.authorizationUrl).toBe('https://checkout.paystack.com/abc')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const call = fetchMock.mock.calls[0]
    if (!call) throw new Error('fetch was not called')
    const [url, init] = call
    expect(url).toBe('https://api.paystack.co/transaction/initialize')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.amount).toBe(500000)
    expect(body.reference).toBe('sub_abc123')
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer sk_test_key' })
  })

  it('verifyTransaction parses a successful response', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: true,
          message: 'ok',
          data: {
            reference: 'sub_abc123',
            status: 'success',
            amount: 500000,
            currency: 'NGN',
            id: 12345,
            paid_at: '2026-08-25T00:00:00.000Z',
          },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    const transport = createPaystackTransport('sk_test_key')
    const result = await transport.verifyTransaction('sub_abc123')

    expect(result.status).toBe('success')
    expect(result.amountMinor).toBe(500000)
    expect(result.transactionId).toBe(12345)
  })

  it('verifyTransaction parses a failed response as status "failed", not an error', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: true,
          message: 'ok',
          data: {
            reference: 'sub_abc123',
            status: 'failed',
            amount: 500000,
            currency: 'NGN',
            id: 12345,
            paid_at: null,
          },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    const transport = createPaystackTransport('sk_test_key')
    const result = await transport.verifyTransaction('sub_abc123')
    expect(result.status).toBe('failed')
  })

  it('throws PaystackError on a non-2xx response', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: false, message: 'Invalid key' }), { status: 401 }),
      ) as unknown as typeof fetch

    const transport = createPaystackTransport('sk_bad_key')
    await expect(transport.verifyTransaction('sub_abc123')).rejects.toThrow(PaystackError)
  })

  it('throws PaystackError of kind "network" when fetch itself rejects', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch

    const transport = createPaystackTransport('sk_test_key')
    await expect(transport.verifyTransaction('sub_abc123')).rejects.toMatchObject({
      kind: 'network',
    })
  })
})
