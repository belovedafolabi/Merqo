import { describe, expect, it } from 'vitest'

import {
  branchPriceOverrideInputSchema,
  categoryInputSchema,
  productInputSchema,
  productVariantInputSchema,
} from '@/lib/products/schemas'

/**
 * Pure schema-validation coverage, same shape as
 * tests/unit/business-structure/schemas.test.ts — the schemas
 * lib/products/mutations.ts parses against, no database needed.
 */
describe('categoryInputSchema', () => {
  it('rejects an empty name', () => {
    expect(categoryInputSchema.safeParse({ name: '' }).success).toBe(false)
  })

  it('accepts a name with an optional description', () => {
    const result = categoryInputSchema.safeParse({ name: 'Drinks', description: 'Beverages' })
    expect(result.success).toBe(true)
  })
})

describe('productInputSchema', () => {
  const base = {
    name: 'Coca-Cola 50cl',
    sku: 'COKE-50CL',
    unitOfMeasurement: 'unit',
    basePrice: 500,
  }

  it('rejects an empty SKU', () => {
    expect(productInputSchema.safeParse({ ...base, sku: '' }).success).toBe(false)
  })

  it('rejects a negative base price', () => {
    expect(productInputSchema.safeParse({ ...base, basePrice: -1 }).success).toBe(false)
  })

  it('accepts costPrice omitted entirely (a caller lacking products.view_cost_price)', () => {
    const result = productInputSchema.safeParse(base)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.costPrice).toBeUndefined()
  })

  it('rejects a negative cost price when one is supplied', () => {
    expect(productInputSchema.safeParse({ ...base, costPrice: -5 }).success).toBe(false)
  })

  it('coerces numeric-string prices (form fields arrive as strings)', () => {
    const result = productInputSchema.safeParse({ ...base, basePrice: '750', costPrice: '400' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.basePrice).toBe(750)
      expect(result.data.costPrice).toBe(400)
    }
  })
})

describe('productVariantInputSchema', () => {
  it('accepts a variant with no price overrides (inherits the parent)', () => {
    const result = productVariantInputSchema.safeParse({ name: 'Large' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.costPrice).toBeUndefined()
      expect(result.data.basePrice).toBeUndefined()
    }
  })

  it('accepts an explicit null price (cleared override, inherit)', () => {
    const result = productVariantInputSchema.safeParse({
      name: 'Large',
      costPrice: null,
      basePrice: null,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.costPrice).toBeNull()
      expect(result.data.basePrice).toBeNull()
    }
  })

  it('rejects a negative price override', () => {
    expect(productVariantInputSchema.safeParse({ name: 'Large', basePrice: -1 }).success).toBe(
      false,
    )
  })
})

describe('branchPriceOverrideInputSchema', () => {
  it('rejects a non-UUID branchId', () => {
    expect(
      branchPriceOverrideInputSchema.safeParse({ branchId: 'not-a-uuid', price: 500 }).success,
    ).toBe(false)
  })

  it('rejects a negative price', () => {
    expect(
      branchPriceOverrideInputSchema.safeParse({
        branchId: '11111111-1111-4111-8111-111111111111',
        price: -1,
      }).success,
    ).toBe(false)
  })

  it('accepts a valid override', () => {
    const result = branchPriceOverrideInputSchema.safeParse({
      branchId: '11111111-1111-4111-8111-111111111111',
      price: 600,
    })
    expect(result.success).toBe(true)
  })
})
