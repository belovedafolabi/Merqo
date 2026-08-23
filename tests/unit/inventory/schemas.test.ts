import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  lowStockThresholdInputSchema,
  stockAdjustmentInputSchema,
  stockTransferInputSchema,
} from '@/lib/inventory/schemas'

/**
 * Pure schema-validation coverage, same shape as
 * tests/unit/products/schemas.test.ts — the schemas
 * lib/inventory/mutations.ts parses against, no database needed. Uses
 * real randomUUID() values rather than hand-typed placeholders: zod's
 * z.uuid() validates the RFC4122 version/variant nibbles, which a
 * hand-typed "11111111-1111-1111-1111-111111111111"-style placeholder
 * doesn't satisfy.
 */
describe('stockAdjustmentInputSchema', () => {
  const base = {
    branchId: randomUUID(),
    productId: randomUUID(),
    quantityDelta: 10,
    reason: 'New delivery',
  }

  it('accepts a valid adjustment', () => {
    expect(stockAdjustmentInputSchema.safeParse(base).success).toBe(true)
  })

  it('rejects a zero quantity change', () => {
    expect(stockAdjustmentInputSchema.safeParse({ ...base, quantityDelta: 0 }).success).toBe(false)
  })

  it('accepts a negative quantity change (removing stock)', () => {
    const result = stockAdjustmentInputSchema.safeParse({ ...base, quantityDelta: -3 })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.quantityDelta).toBe(-3)
  })

  it('rejects an empty reason', () => {
    expect(stockAdjustmentInputSchema.safeParse({ ...base, reason: '' }).success).toBe(false)
  })

  it('coerces a numeric-string quantity (form fields arrive as strings)', () => {
    const result = stockAdjustmentInputSchema.safeParse({ ...base, quantityDelta: '5' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.quantityDelta).toBe(5)
  })
})

describe('stockTransferInputSchema', () => {
  const base = {
    sourceBranchId: randomUUID(),
    destinationBranchId: randomUUID(),
    items: [
      {
        sourceProductId: randomUUID(),
        destinationProductId: randomUUID(),
        quantity: 5,
      },
    ],
  }

  it('accepts a valid transfer', () => {
    expect(stockTransferInputSchema.safeParse(base).success).toBe(true)
  })

  it('rejects a same-branch transfer', () => {
    const result = stockTransferInputSchema.safeParse({
      ...base,
      destinationBranchId: base.sourceBranchId,
    })
    expect(result.success).toBe(false)
  })

  it('rejects a transfer with no items', () => {
    expect(stockTransferInputSchema.safeParse({ ...base, items: [] }).success).toBe(false)
  })

  it('rejects an item with a non-positive quantity', () => {
    const result = stockTransferInputSchema.safeParse({
      ...base,
      items: [{ ...base.items[0], quantity: 0 }],
    })
    expect(result.success).toBe(false)
  })
})

describe('lowStockThresholdInputSchema', () => {
  it('accepts a null threshold (clearing it)', () => {
    const result = lowStockThresholdInputSchema.safeParse({ threshold: null })
    expect(result.success).toBe(true)
  })

  it('rejects a negative threshold', () => {
    expect(lowStockThresholdInputSchema.safeParse({ threshold: -1 }).success).toBe(false)
  })

  it('accepts a zero threshold', () => {
    expect(lowStockThresholdInputSchema.safeParse({ threshold: 0 }).success).toBe(true)
  })
})
