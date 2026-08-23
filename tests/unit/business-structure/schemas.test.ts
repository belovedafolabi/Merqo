import { describe, expect, it } from 'vitest'

import {
  branchInputSchema,
  businessUnitInputSchema,
  posConfigInputSchema,
} from '@/lib/business-structure/schemas'

/**
 * Pure schema-validation coverage per docs/milestones/
 * 05-business-structure-and-onboarding.md Testing Requirements: "invalid POS
 * configuration values (negative tax rate, malformed discount policy) are
 * rejected server-side even if a malicious client bypasses the form." These
 * are the same schemas lib/business-structure/mutations.ts parses against —
 * no database needed, this is the schema's own logic.
 */
describe('branchInputSchema', () => {
  it('rejects an empty name', () => {
    expect(branchInputSchema.safeParse({ name: '' }).success).toBe(false)
    expect(branchInputSchema.safeParse({ name: '   ' }).success).toBe(false)
  })

  it('accepts a trimmed, reasonable name', () => {
    const result = branchInputSchema.safeParse({ name: '  Main Branch  ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.name).toBe('Main Branch')
  })
})

describe('businessUnitInputSchema', () => {
  it('rejects non-UUID branchId/businessTypeId', () => {
    expect(
      businessUnitInputSchema.safeParse({
        branchId: 'not-a-uuid',
        businessTypeId: 'nope',
        name: 'Shop',
      }).success,
    ).toBe(false)
  })

  it('accepts valid UUIDs and a name', () => {
    const result = businessUnitInputSchema.safeParse({
      branchId: '123e4567-e89b-12d3-a456-426614174000',
      businessTypeId: '9f8e7d6c-5b4a-4a3b-8c2d-1e0f9a8b7c6d',
      name: 'Shop',
    })
    expect(result.success).toBe(true)
  })
})

describe('posConfigInputSchema', () => {
  const valid = {
    taxRate: 7.5,
    serviceChargeEnabled: false,
    serviceChargeType: 'percentage' as const,
    serviceChargeValue: 0,
    discountRequiresAuthorization: true,
    discountMaxPercentage: 10,
    discountMaxAmount: null,
    discountReasonRequired: true,
    defaultPaymentMethod: 'cash' as const,
  }

  it('accepts a valid configuration', () => {
    expect(posConfigInputSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects a negative tax rate', () => {
    expect(posConfigInputSchema.safeParse({ ...valid, taxRate: -1 }).success).toBe(false)
  })

  it('rejects a tax rate over 100', () => {
    expect(posConfigInputSchema.safeParse({ ...valid, taxRate: 150 }).success).toBe(false)
  })

  it('rejects a negative discount max amount', () => {
    expect(posConfigInputSchema.safeParse({ ...valid, discountMaxAmount: -5 }).success).toBe(false)
  })

  it('rejects a percentage service charge over 100', () => {
    const result = posConfigInputSchema.safeParse({
      ...valid,
      serviceChargeEnabled: true,
      serviceChargeType: 'percentage',
      serviceChargeValue: 150,
    })
    expect(result.success).toBe(false)
  })

  it('allows a fixed service charge value over 100', () => {
    const result = posConfigInputSchema.safeParse({
      ...valid,
      serviceChargeEnabled: true,
      serviceChargeType: 'fixed',
      serviceChargeValue: 500,
    })
    expect(result.success).toBe(true)
  })

  it('rejects an invalid default payment method', () => {
    expect(
      posConfigInputSchema.safeParse({ ...valid, defaultPaymentMethod: 'crypto' }).success,
    ).toBe(false)
  })
})
