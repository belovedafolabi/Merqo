import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { verifyPaystackSignature } from '@/lib/paystack/signature'

/**
 * The highest-confidence unit test in this milestone (see signature.ts's own
 * doc comment): pure, synchronous HMAC-SHA512 verification, no I/O.
 */
describe('verifyPaystackSignature', () => {
  const secret = 'sk_test_secret_key_value'
  const rawBody = JSON.stringify({ event: 'charge.success', data: { reference: 'sub_abc123' } })

  function sign(body: string, key: string): string {
    return createHmac('sha512', key).update(body, 'utf8').digest('hex')
  }

  it('accepts a correctly signed payload', () => {
    const header = sign(rawBody, secret)
    expect(verifyPaystackSignature(rawBody, header, secret)).toBe(true)
  })

  it('rejects a payload signed with a different secret', () => {
    const header = sign(rawBody, 'sk_test_wrong_secret')
    expect(verifyPaystackSignature(rawBody, header, secret)).toBe(false)
  })

  it('rejects when the body has been tampered with after signing', () => {
    const header = sign(rawBody, secret)
    const tamperedBody = JSON.stringify({
      event: 'charge.success',
      data: { reference: 'sub_evil' },
    })
    expect(verifyPaystackSignature(tamperedBody, header, secret)).toBe(false)
  })

  it('rejects a missing signature header', () => {
    expect(verifyPaystackSignature(rawBody, null, secret)).toBe(false)
  })

  it('rejects a header of the wrong length without throwing', () => {
    expect(() => verifyPaystackSignature(rawBody, 'short', secret)).not.toThrow()
    expect(verifyPaystackSignature(rawBody, 'short', secret)).toBe(false)
  })

  it('rejects a same-length but incorrect header', () => {
    const header = sign(rawBody, secret)
    const flipped = header.slice(0, -1) + (header.at(-1) === 'a' ? 'b' : 'a')
    expect(verifyPaystackSignature(rawBody, flipped, secret)).toBe(false)
  })

  it('is sensitive to JSON re-serialization — a stringify-then-reparse of the same object is not guaranteed to match', () => {
    // Demonstrates why the Route Handler must sign the RAW text, not
    // JSON.stringify(JSON.parse(raw)) — key order changes here on purpose.
    const reordered = JSON.stringify({ data: { reference: 'sub_abc123' }, event: 'charge.success' })
    const header = sign(rawBody, secret)
    expect(reordered).not.toEqual(rawBody)
    expect(verifyPaystackSignature(reordered, header, secret)).toBe(false)
  })
})
