import { logger } from '@/lib/logger'

import { createPaystackTransport } from './transports/paystack'
import type { PaystackTransport } from './types'

/**
 * PaystackService — the single seam onto the Paystack transport, mirroring
 * lib/email/service.ts's shape.
 *
 * ONE DELIBERATE DIVERGENCE from lib/email/service.ts: resolveEmailTransport()
 * falls back to a "log" transport when RESEND_API_KEY is unset, because a
 * logged EMAIL is a degraded notification. resolvePaystackTransport()
 * returns null instead, because a logged PAYMENT would be a lie — there is
 * no safe stand-in for "we pretended to charge the customer." Callers
 * (lib/subscription/mutations.ts) must handle null explicitly.
 *
 * Server-side only. PAYSTACK_SECRET_KEY is read here and is never
 * NEXT_PUBLIC_-prefixed, so it never reaches a client bundle.
 */

let cachedTransport: PaystackTransport | null | undefined

/**
 * Resolves the transport from the environment, once per process.
 * Returns null when PAYSTACK_SECRET_KEY is unset — online payment is simply
 * unavailable, not silently downgraded to a log line.
 */
export function resolvePaystackTransport(): PaystackTransport | null {
  if (cachedTransport !== undefined) return cachedTransport

  const secretKey = process.env.PAYSTACK_SECRET_KEY

  if (!secretKey) {
    logger.warn('paystack.transport_unavailable', {
      reason: 'PAYSTACK_SECRET_KEY is not set; online payment is disabled',
    })
    cachedTransport = null
    return cachedTransport
  }

  cachedTransport = createPaystackTransport(secretKey)
  return cachedTransport
}

/** Test seam: drops the memoized transport so the next call re-reads the env. */
export function resetPaystackTransport(): void {
  cachedTransport = undefined
}

/**
 * Resolves the shared secret Paystack's webhook signature is verified
 * against. `PAYSTACK_WEBHOOK_SECRET` is reserved by .env.example, but
 * Paystack has no such distinct credential in its product — it signs
 * webhooks with the SECRET KEY. This falls back to PAYSTACK_SECRET_KEY so
 * the reserved variable name is honored without inventing a credential
 * Paystack will never issue.
 */
export function resolvePaystackWebhookSecret(): string | null {
  return process.env.PAYSTACK_WEBHOOK_SECRET ?? process.env.PAYSTACK_SECRET_KEY ?? null
}
