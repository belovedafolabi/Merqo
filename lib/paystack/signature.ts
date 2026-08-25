import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Verifies Paystack's `x-paystack-signature` header: HMAC-SHA512 of the raw
 * request body, keyed by the secret key, hex-encoded.
 * https://paystack.com/docs/payments/webhooks/#verify-events
 *
 * Pure and synchronous — no I/O, no Supabase, nothing async. This is
 * deliberate: signature verification must happen on the raw bytes Paystack
 * actually sent, before any parsing, and being pure makes it the cheapest,
 * highest-confidence unit test in the whole milestone
 * (tests/unit/paystack/signature.test.ts).
 *
 * `rawBody` MUST be exactly what `await request.text()` returned in the
 * webhook Route Handler — NOT `JSON.stringify(JSON.parse(rawBody))`. Key
 * order and whitespace differ between those two, and the signature is over
 * the literal bytes Paystack transmitted.
 */
export function verifyPaystackSignature(
  rawBody: string,
  header: string | null,
  secret: string,
): boolean {
  if (!header) return false

  const expected = createHmac('sha512', secret).update(rawBody, 'utf8').digest('hex')

  const expectedBuffer = Buffer.from(expected, 'utf8')
  const headerBuffer = Buffer.from(header, 'utf8')

  // timingSafeEqual throws on a length mismatch rather than returning false —
  // guard explicitly so a malformed/short header fails closed instead of
  // crashing the request handler.
  if (expectedBuffer.length !== headerBuffer.length) return false

  return timingSafeEqual(expectedBuffer, headerBuffer)
}
