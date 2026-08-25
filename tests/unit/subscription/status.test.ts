import { describe, expect, it } from 'vitest'

import { daysUntilExpiry, resolveSubscriptionStatus } from '@/lib/subscription/status'

describe('resolveSubscriptionStatus', () => {
  const now = new Date('2026-08-25T00:00:00.000Z')

  it('is ACTIVE with more than 7 days remaining', () => {
    const periodEnd = new Date('2026-09-05T00:00:00.000Z') // 11 days out
    expect(resolveSubscriptionStatus(periodEnd, now)).toBe('ACTIVE')
  })

  it('is EXPIRING at exactly 7 days remaining', () => {
    const periodEnd = new Date('2026-09-01T00:00:00.000Z') // exactly 7 days
    expect(resolveSubscriptionStatus(periodEnd, now)).toBe('EXPIRING')
  })

  it('is EXPIRING with 1 day remaining', () => {
    const periodEnd = new Date('2026-08-26T00:00:00.000Z')
    expect(resolveSubscriptionStatus(periodEnd, now)).toBe('EXPIRING')
  })

  it('is EXPIRED the instant the period ends', () => {
    expect(resolveSubscriptionStatus(now, now)).toBe('EXPIRED')
  })

  it('is EXPIRED one second past the period end', () => {
    const periodEnd = new Date(now.getTime() - 1000)
    expect(resolveSubscriptionStatus(periodEnd, now)).toBe('EXPIRED')
  })
})

describe('daysUntilExpiry', () => {
  const now = new Date('2026-08-25T00:00:00.000Z')

  it('rounds up any partial day remaining', () => {
    const periodEnd = new Date('2026-08-25T00:00:01.000Z') // 1 second from now
    expect(daysUntilExpiry(periodEnd, now)).toBe(1)
  })

  it('is 0 or negative once expired', () => {
    expect(daysUntilExpiry(now, now)).toBe(0)
    expect(daysUntilExpiry(new Date(now.getTime() - 86400_000), now)).toBe(-1)
  })
})
