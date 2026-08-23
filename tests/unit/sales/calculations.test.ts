import { describe, expect, it } from 'vitest'

import {
  calculateLineTotal,
  calculateDiscount,
  calculateTax,
  calculateServiceCharge,
  calculateSaleTotals,
  type PosConfigForCalc,
} from '@/lib/sales/calculations'

/**
 * Milestone 08's own calculation suite (this milestone's Testing
 * Requirements: "Unit tests: discount/tax/service-charge/total calculation
 * functions, covering the documented calculation order and edge cases
 * (zero-quantity, maximum discount, disabled service charge, etc.)"). Pure
 * functions only, mirroring tests/unit/products/pricing.test.ts's own
 * no-database approach.
 */

const basePosConfig: PosConfigForCalc = {
  taxRate: 0,
  serviceChargeEnabled: false,
  serviceChargeType: 'percentage',
  serviceChargeValue: 0,
}

describe('calculateLineTotal', () => {
  it('multiplies quantity by unit price', () => {
    expect(calculateLineTotal({ quantity: 3, unitPrice: 500 })).toMatchObject({ lineTotal: 1500 })
  })

  it('subtracts a per-line discount', () => {
    expect(calculateLineTotal({ quantity: 2, unitPrice: 500, lineDiscount: 200 })).toMatchObject({
      lineTotal: 800,
    })
  })

  it('never goes negative even if the line discount exceeds the line value', () => {
    expect(calculateLineTotal({ quantity: 1, unitPrice: 100, lineDiscount: 500 })).toMatchObject({
      lineTotal: 0,
    })
  })
})

describe('calculateDiscount', () => {
  it('returns 0 when no discount is requested', () => {
    expect(calculateDiscount(1000, undefined)).toBe(0)
  })

  it('applies a percentage discount', () => {
    expect(calculateDiscount(1000, { percentage: 10 })).toBe(100)
  })

  it('a flat amount takes precedence over percentage when both are supplied', () => {
    expect(calculateDiscount(1000, { percentage: 10, amount: 50 })).toBe(50)
  })

  it('caps the discount at the subtotal — a "maximum discount" can never exceed 100%', () => {
    expect(calculateDiscount(1000, { percentage: 150 })).toBe(1000)
    expect(calculateDiscount(1000, { amount: 5000 })).toBe(1000)
  })

  it('zero subtotal produces zero discount regardless of request', () => {
    expect(calculateDiscount(0, { percentage: 50 })).toBe(0)
  })
})

describe('calculateTax', () => {
  it('applies the configured tax rate to the post-discount subtotal', () => {
    expect(calculateTax(1000, 7.5)).toBe(75)
  })

  it('zero tax rate produces zero tax', () => {
    expect(calculateTax(1000, 0)).toBe(0)
  })

  it('zero subtotal produces zero tax', () => {
    expect(calculateTax(0, 7.5)).toBe(0)
  })
})

describe('calculateServiceCharge', () => {
  it('a disabled service charge is always 0, regardless of value/type', () => {
    expect(calculateServiceCharge(1000, { enabled: false, type: 'percentage', value: 10 })).toBe(0)
  })

  it('applies a percentage service charge on the post-discount subtotal', () => {
    expect(calculateServiceCharge(1000, { enabled: true, type: 'percentage', value: 10 })).toBe(100)
  })

  it('applies a fixed service charge regardless of subtotal size', () => {
    expect(calculateServiceCharge(1000, { enabled: true, type: 'fixed', value: 250 })).toBe(250)
  })

  it('zero subtotal produces zero service charge', () => {
    expect(calculateServiceCharge(0, { enabled: true, type: 'percentage', value: 10 })).toBe(0)
  })
})

describe('calculateSaleTotals — documented order: subtotal -> discount -> tax -> service charge', () => {
  it('zero-quantity cart (no items) totals to all zeros', () => {
    const totals = calculateSaleTotals([], undefined, basePosConfig)
    expect(totals).toMatchObject({
      subtotal: 0,
      discountAmount: 0,
      taxAmount: 0,
      serviceChargeAmount: 0,
      total: 0,
    })
  })

  it('tax and service charge are both computed on the post-discount subtotal, not the pre-discount one', () => {
    const posConfig: PosConfigForCalc = {
      taxRate: 10,
      serviceChargeEnabled: true,
      serviceChargeType: 'percentage',
      serviceChargeValue: 10,
    }
    const totals = calculateSaleTotals(
      [{ quantity: 1, unitPrice: 1000 }],
      { percentage: 20 },
      posConfig,
    )

    // subtotal 1000 -> discount 200 -> post-discount 800 -> tax 80, service charge 80 -> total 960
    expect(totals.subtotal).toBe(1000)
    expect(totals.discountAmount).toBe(200)
    expect(totals.taxAmount).toBe(80)
    expect(totals.serviceChargeAmount).toBe(80)
    expect(totals.total).toBe(960)
  })

  it('maximum discount (100%) zeroes out tax and service charge too, since both apply to the post-discount subtotal', () => {
    const posConfig: PosConfigForCalc = {
      taxRate: 10,
      serviceChargeEnabled: true,
      serviceChargeType: 'percentage',
      serviceChargeValue: 10,
    }
    const totals = calculateSaleTotals(
      [{ quantity: 1, unitPrice: 1000 }],
      { percentage: 100 },
      posConfig,
    )

    expect(totals.discountAmount).toBe(1000)
    expect(totals.taxAmount).toBe(0)
    expect(totals.serviceChargeAmount).toBe(0)
    expect(totals.total).toBe(0)
  })

  it('a disabled service charge contributes nothing to the total even with a nonzero tax rate', () => {
    const posConfig: PosConfigForCalc = {
      taxRate: 5,
      serviceChargeEnabled: false,
      serviceChargeType: 'fixed',
      serviceChargeValue: 500,
    }
    const totals = calculateSaleTotals([{ quantity: 2, unitPrice: 200 }], undefined, posConfig)

    expect(totals.subtotal).toBe(400)
    expect(totals.serviceChargeAmount).toBe(0)
    expect(totals.taxAmount).toBe(20)
    expect(totals.total).toBe(420)
  })

  it('sums multiple line items into one subtotal', () => {
    const totals = calculateSaleTotals(
      [
        { quantity: 2, unitPrice: 500 },
        { quantity: 1, unitPrice: 250 },
      ],
      undefined,
      basePosConfig,
    )
    expect(totals.subtotal).toBe(1250)
    expect(totals.total).toBe(1250)
  })
})
