import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { toErrorMessage } from '@/lib/errors'
import { AuthorizationError } from '@/lib/auth/guard'
import { RateLimitError } from '@/lib/rate-limit/limiter'

/**
 * toErrorMessage() is the fix for the checkout "Something went wrong"
 * regression: supabase-postgrest resolves a failed `{ data, error }` with a
 * PLAIN OBJECT (no `throwOnError`), which `error instanceof Error` missed,
 * collapsing every DB failure into one generic string.
 */
describe('toErrorMessage', () => {
  it('unwraps a plain PostgREST-shaped error object (not an Error instance)', () => {
    const pgError = { message: 'insufficient stock', code: 'P0001', details: null, hint: null }
    expect(pgError instanceof Error).toBe(false)
    expect(toErrorMessage(pgError)).toBe('Not enough stock for one or more items in this sale.')
  })

  it('maps a permission-denied code to a plain-language message', () => {
    expect(toErrorMessage({ code: '42501', message: 'permission denied for table sales' })).toMatch(
      /permission/i,
    )
  })

  it('maps a unique-violation code', () => {
    expect(toErrorMessage({ code: '23505', message: 'duplicate key' })).toMatch(/already in use/i)
  })

  it('falls back to the raw message for an unmapped Postgres code', () => {
    expect(toErrorMessage({ code: 'XX999', message: 'internal error text' })).toBe(
      'internal error text',
    )
  })

  it('uses the first issue of a ZodError', () => {
    const parsed = z.object({ name: z.string().min(1, 'Name is required.') }).safeParse({ name: '' })
    expect(parsed.success).toBe(false)
    if (!parsed.success) expect(toErrorMessage(parsed.error)).toBe('Name is required.')
  })

  it('recognises AuthorizationError and RateLimitError', () => {
    expect(toErrorMessage(new AuthorizationError('sales.create'))).toMatch(/permission/i)
    expect(toErrorMessage(new RateLimitError('checkout'))).toMatch(/too many/i)
  })

  it('passes through a plain Error message', () => {
    expect(toErrorMessage(new Error('This business unit has no POS configuration yet.'))).toBe(
      'This business unit has no POS configuration yet.',
    )
  })

  it('uses the fallback for a value with no usable message', () => {
    expect(toErrorMessage(null)).toBe('Something went wrong. Please try again.')
    expect(toErrorMessage(undefined, 'custom fallback')).toBe('custom fallback')
  })
})
