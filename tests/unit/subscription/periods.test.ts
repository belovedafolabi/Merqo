import { describe, expect, it } from 'vitest'

import { addBillingPeriod, formatMinor, toMinorUnits } from '@/lib/subscription/periods'

describe('addBillingPeriod', () => {
  it('adds one month for MONTHLY', () => {
    const from = new Date('2026-01-15T00:00:00.000Z')
    const result = addBillingPeriod(from, 'MONTHLY')
    expect(result.toISOString()).toBe('2026-02-15T00:00:00.000Z')
  })

  it('adds three months for QUARTERLY', () => {
    const from = new Date('2026-01-15T00:00:00.000Z')
    const result = addBillingPeriod(from, 'QUARTERLY')
    expect(result.getUTCMonth()).toBe(3) // April (0-indexed)
  })

  it('adds twelve months for ANNUAL', () => {
    const from = new Date('2026-01-15T00:00:00.000Z')
    const result = addBillingPeriod(from, 'ANNUAL')
    expect(result.getUTCFullYear()).toBe(2027)
  })

  it('handles month-end overflow (Jan 31 + 1 month)', () => {
    const from = new Date('2026-01-31T00:00:00.000Z')
    const result = addBillingPeriod(from, 'MONTHLY')
    // JS Date normalizes overflow rather than clamping — documented behavior,
    // distinct from Postgres' clamp-to-end-of-month `+ interval '1 mon'`.
    expect(result.getUTCMonth()).toBe(2) // rolls into March
  })
})

describe('formatMinor', () => {
  it('formats kobo as Naira with two decimal places', () => {
    expect(formatMinor(500000, 'NGN')).toContain('5,000.00')
  })

  it('formats zero correctly', () => {
    expect(formatMinor(0, 'NGN')).toContain('0.00')
  })
})

describe('toMinorUnits', () => {
  it('converts major units to minor units', () => {
    expect(toMinorUnits(5000)).toBe(500000)
  })

  it('rounds fractional major units', () => {
    expect(toMinorUnits(5000.005)).toBe(500001)
  })
})
