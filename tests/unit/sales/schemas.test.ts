import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  createSaleInputSchema,
  holdSaleInputSchema,
  createReturnInputSchema,
  requestRefundInputSchema,
  decideRefundInputSchema,
} from '@/lib/sales/schemas'

/**
 * Pure schema-validation coverage, same shape as tests/unit/inventory/
 * schemas.test.ts — the schemas lib/sales/mutations.ts parses against, no
 * database needed.
 */
describe('createSaleInputSchema', () => {
  const base = {
    branchId: randomUUID(),
    businessUnitId: randomUUID(),
    idempotencyKey: randomUUID(),
    items: [{ productId: randomUUID(), quantity: 1 }],
    paymentMethod: 'cash' as const,
  }

  it('accepts a minimal valid sale', () => {
    expect(createSaleInputSchema.safeParse(base).success).toBe(true)
  })

  it('rejects a sale with no items', () => {
    expect(createSaleInputSchema.safeParse({ ...base, items: [] }).success).toBe(false)
  })

  it('rejects a zero-quantity item', () => {
    const result = createSaleInputSchema.safeParse({
      ...base,
      items: [{ productId: base.items[0]!.productId, quantity: 0 }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects a missing idempotency key', () => {
    expect(createSaleInputSchema.safeParse({ ...base, idempotencyKey: '' }).success).toBe(false)
  })

  it('rejects an unsupported payment method', () => {
    expect(createSaleInputSchema.safeParse({ ...base, paymentMethod: 'bitcoin' }).success).toBe(
      false,
    )
  })

  it('accepts an optional discount percentage', () => {
    const result = createSaleInputSchema.safeParse({ ...base, discountPercentage: 10 })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.discountPercentage).toBe(10)
  })

  it('rejects a discount percentage over 100', () => {
    expect(createSaleInputSchema.safeParse({ ...base, discountPercentage: 150 }).success).toBe(
      false,
    )
  })
})

describe('holdSaleInputSchema', () => {
  it('accepts a hold with at least one item', () => {
    const result = holdSaleInputSchema.safeParse({
      branchId: randomUUID(),
      businessUnitId: randomUUID(),
      items: [{ productId: randomUUID(), quantity: 2 }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects a hold with no items', () => {
    const result = holdSaleInputSchema.safeParse({
      branchId: randomUUID(),
      businessUnitId: randomUUID(),
      items: [],
    })
    expect(result.success).toBe(false)
  })
})

describe('createReturnInputSchema', () => {
  const base = {
    saleId: randomUUID(),
    reason: 'Wrong size',
    items: [{ saleItemId: randomUUID(), quantity: 1 }],
  }

  it('accepts a valid return', () => {
    expect(createReturnInputSchema.safeParse(base).success).toBe(true)
  })

  it('rejects a return with no reason', () => {
    expect(createReturnInputSchema.safeParse({ ...base, reason: '' }).success).toBe(false)
  })

  it('rejects a return with no items', () => {
    expect(createReturnInputSchema.safeParse({ ...base, items: [] }).success).toBe(false)
  })
})

describe('requestRefundInputSchema', () => {
  const base = {
    saleId: randomUUID(),
    amount: 500,
    method: 'cash' as const,
    reason: 'Customer dissatisfied',
  }

  it('accepts a valid refund request', () => {
    expect(requestRefundInputSchema.safeParse(base).success).toBe(true)
  })

  it('rejects a zero-amount refund', () => {
    expect(requestRefundInputSchema.safeParse({ ...base, amount: 0 }).success).toBe(false)
  })

  it('rejects a negative refund amount', () => {
    expect(requestRefundInputSchema.safeParse({ ...base, amount: -10 }).success).toBe(false)
  })
})

describe('decideRefundInputSchema', () => {
  it('accepts an approval decision', () => {
    const result = decideRefundInputSchema.safeParse({ refundId: randomUUID(), approved: true })
    expect(result.success).toBe(true)
  })

  it('coerces a string boolean (form fields arrive as strings)', () => {
    const result = decideRefundInputSchema.safeParse({ refundId: randomUUID(), approved: 'true' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.approved).toBe(true)
  })
})
