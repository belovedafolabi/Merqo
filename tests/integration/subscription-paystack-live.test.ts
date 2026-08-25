import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { createPaystackTransport } from '@/lib/paystack/transports/paystack'

/**
 * Opt-in live Paystack sandbox test, mirroring
 * tests/integration/notifications-email.test.ts's RESEND_TEST_RECIPIENT
 * pattern exactly: self-skips unless PAYSTACK_SECRET_KEY is a real
 * TEST-MODE secret key, so CI stays green with zero new secrets.
 *
 * SCOPE, DELIBERATELY LIMITED. This proves the two automated legs of the
 * checkout flow — initialize and verify — actually work against Paystack's
 * real API. The middle leg (a human entering a test card on Paystack's
 * hosted checkout page) cannot be automated here without driving a
 * third-party UI, which the milestone's Definition of Done covers instead
 * ("a manual test confirms the full lifecycle end-to-end"). The fully
 * automated extension path, with verify's response stubbed, is
 * tests/integration/subscription-webhook.test.ts.
 */
const live = Boolean(process.env.PAYSTACK_SECRET_KEY)

describe.skipIf(!live)('live Paystack sandbox (opt-in)', () => {
  it('initializeTransaction returns a real checkout URL', async () => {
    const transport = createPaystackTransport(process.env.PAYSTACK_SECRET_KEY!)
    const reference = `test_${randomUUID()}`

    const result = await transport.initializeTransaction({
      reference,
      amountMinor: 500000,
      currency: 'NGN',
      email: 'test@example.com',
      callbackUrl: 'https://example.com/settings/subscription',
    })

    expect(result.authorizationUrl).toMatch(/^https:\/\//)
    expect(result.reference).toBe(reference)
  })

  it('verifyTransaction resolves an unpaid reference as not-successful, not an error', async () => {
    const transport = createPaystackTransport(process.env.PAYSTACK_SECRET_KEY!)
    const reference = `test_${randomUUID()}`

    // Initialize without ever completing checkout — Paystack still has a
    // real transaction record to verify, just an unpaid one.
    await transport.initializeTransaction({
      reference,
      amountMinor: 500000,
      currency: 'NGN',
      email: 'test@example.com',
      callbackUrl: 'https://example.com/settings/subscription',
    })

    const result = await transport.verifyTransaction(reference)
    expect(result.status).not.toBe('success')
  })
})
