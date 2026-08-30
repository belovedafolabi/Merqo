import { describe, expect, it } from 'vitest'

import type { CartLine } from '@/lib/pos/cart-context'
import {
  CUSTOMER_DISPLAY_PROTOCOL_VERSION,
  isCurrentProtocol,
  toCustomerDisplaySnapshot,
} from '@/lib/pos/customer-display'
import type { SaleTotals } from '@/lib/sales/calculations'

/**
 * Milestone 14's Security Requirement for the customer display — "exposes
 * only cart/total information... reviewed explicitly since it's a new,
 * less-restricted-by-design surface" — turned into a mechanical check rather
 * than a memo.
 *
 * The allowlist assertions below are the point of this file. A future
 * `...line` spread in toCustomerDisplaySnapshot is the realistic way a
 * productId, a cost price, or a discount reason ends up on a screen facing
 * the public, and it would fail here instead of shipping.
 */

const SNAPSHOT_KEYS = [
  'v',
  'lines',
  'subtotal',
  'discountAmount',
  'taxAmount',
  'serviceChargeAmount',
  'total',
] as const

const LINE_KEYS = ['key', 'name', 'quantity', 'lineTotal'] as const

const lines: CartLine[] = [
  {
    productId: 'prod-secret-1',
    variantId: 'var-secret-1',
    name: 'Milk 1L',
    unitPrice: 1200,
    quantity: 2,
  },
  { productId: 'prod-secret-2', variantId: null, name: 'Bread', unitPrice: 850, quantity: 1 },
]

const totals: SaleTotals = {
  subtotal: 3250,
  discountAmount: 250,
  taxAmount: 225,
  serviceChargeAmount: 0,
  total: 3225,
  lineItems: [],
}

describe('toCustomerDisplaySnapshot', () => {
  it('exposes exactly the allowlisted snapshot fields', () => {
    const snapshot = toCustomerDisplaySnapshot(lines, totals)
    expect(Object.keys(snapshot).sort()).toEqual([...SNAPSHOT_KEYS].sort())
  })

  it('exposes exactly the allowlisted line fields', () => {
    const snapshot = toCustomerDisplaySnapshot(lines, totals)
    for (const line of snapshot.lines) {
      expect(Object.keys(line).sort()).toEqual([...LINE_KEYS].sort())
    }
  })

  it('never carries a product or variant id', () => {
    const serialized = JSON.stringify(toCustomerDisplaySnapshot(lines, totals))
    expect(serialized).not.toContain('prod-secret-1')
    expect(serialized).not.toContain('var-secret-1')
  })

  it('drops SaleTotals.lineItems, which is internal calculation detail', () => {
    const snapshot = toCustomerDisplaySnapshot(lines, totals)
    expect(snapshot).not.toHaveProperty('lineItems')
  })

  it('computes a line total the customer can check against the shelf price', () => {
    const snapshot = toCustomerDisplaySnapshot(lines, totals)
    expect(snapshot.lines[0]).toMatchObject({ name: 'Milk 1L', quantity: 2, lineTotal: 2400 })
  })

  it('stamps the current protocol version', () => {
    expect(toCustomerDisplaySnapshot([], totals).v).toBe(CUSTOMER_DISPLAY_PROTOCOL_VERSION)
  })

  it('handles an empty cart', () => {
    expect(toCustomerDisplaySnapshot([], totals).lines).toEqual([])
  })
})

describe('isCurrentProtocol', () => {
  it('accepts a snapshot stamped with the current version', () => {
    const snapshot = toCustomerDisplaySnapshot(lines, totals)
    expect(isCurrentProtocol({ type: 'snapshot', snapshot })).toBe(true)
  })

  it('rejects a snapshot from an older publisher', () => {
    const snapshot = { ...toCustomerDisplaySnapshot(lines, totals), v: 0 }
    expect(isCurrentProtocol({ type: 'snapshot', snapshot })).toBe(false)
  })

  it('always accepts a request-snapshot, which carries no payload to misread', () => {
    expect(isCurrentProtocol({ type: 'request-snapshot' })).toBe(true)
  })
})
