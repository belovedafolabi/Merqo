import { describe, expect, it } from 'vitest'

import { resolveEffectivePriceFromRows, resolveVariantPrice } from '@/lib/products/pricing'

/**
 * Milestone 06's own pricing-resolution suite (docs/milestones/
 * 06-product-catalog-and-pricing.md Testing Requirements: "Unit tests:
 * resolveEffectivePrice() correctness — base price, override present,
 * override absent"). Tests the pure core only (no Supabase client
 * involved), mirroring tests/unit/auth/permissions.test.ts's own approach
 * to resolvePermission().
 */
describe('resolveEffectivePriceFromRows', () => {
  it('returns the product base price when no branch override exists', () => {
    expect(resolveEffectivePriceFromRows({ basePrice: 5000 }, null)).toBe(5000)
  })

  it('returns the branch override price when one exists', () => {
    expect(resolveEffectivePriceFromRows({ basePrice: 5000 }, { price: 5500 })).toBe(5500)
  })

  it('an override of exactly 0 still takes precedence over a nonzero base price', () => {
    expect(resolveEffectivePriceFromRows({ basePrice: 5000 }, { price: 0 })).toBe(0)
  })
})

describe('resolveVariantPrice', () => {
  it("falls back to the parent's resolved price when the variant sets no override", () => {
    expect(resolveVariantPrice(null, 5000)).toBe(5000)
  })

  it('uses the variant’s own price when it sets one', () => {
    expect(resolveVariantPrice(6000, 5000)).toBe(6000)
  })

  it('a variant override of exactly 0 still takes precedence', () => {
    expect(resolveVariantPrice(0, 5000)).toBe(0)
  })
})
