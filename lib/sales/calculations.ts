/**
 * The shared, pure calculation module this milestone's Technical
 * Requirements call for: "All calculation logic (discount/tax/service-
 * charge/total) implemented as pure, unit-testable functions separate from
 * the database-transaction orchestration code." No DB, no `async` — every
 * function here is a plain value-in/value-out transform, unit-tested in
 * tests/unit/sales/calculations.test.ts without spinning up a database.
 *
 * Calculation order (this milestone's own Risks section: "must be resolved
 * and documented explicitly, not left ambiguous"):
 *
 *   subtotal -> discount -> tax -> service charge -> total
 *
 * Both tax and service charge are computed on the *post-discount* subtotal
 * (standard Nigerian retail practice: a discount reduces the taxable base),
 * and are additive to reach `total`. This is the one true order — reused
 * unchanged by checkout, receipt rendering, and (later) Milestone 10's
 * reporting, per this milestone's own API/Backend Changes requirement
 * ("reused by checkout, receipt rendering, and (later) reporting").
 *
 * Every money value is rounded to 2 decimal places at the point it's
 * produced, so intermediate float drift never accumulates into a visibly
 * wrong total.
 */

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export interface SaleLineItemCalcInput {
  quantity: number
  unitPrice: number
  /** Flat per-line discount amount, e.g. a manually adjusted single item's price. Defaults to 0. */
  lineDiscount?: number
}

export interface SaleLineItemCalcResult {
  quantity: number
  unitPrice: number
  lineDiscount: number
  lineTotal: number
}

/** `quantity * unitPrice`, less any per-line discount, floored at 0. */
export function calculateLineTotal(item: SaleLineItemCalcInput): SaleLineItemCalcResult {
  const lineDiscount = item.lineDiscount ?? 0
  const gross = item.quantity * item.unitPrice
  const lineTotal = round2(Math.max(0, gross - lineDiscount))
  return {
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineDiscount: round2(lineDiscount),
    lineTotal,
  }
}

export interface CartDiscountInput {
  /** 0-100. Ignored when `amount` is also set. */
  percentage?: number
  /** A flat amount takes precedence over `percentage` when both are supplied. */
  amount?: number
  /**
   * A redeemed coupon's already-resolved discount amount. Added to the manual
   * discount above rather than replacing it — a coupon and a till discount
   * can both apply to one sale — and the sum is still capped at the subtotal.
   */
  couponAmount?: number
}

/**
 * Order-level discount off the pre-tax subtotal. Always capped at the
 * subtotal itself — a discount can never drive the total negative,
 * regardless of what percentage/amount was requested (the caller —
 * lib/sales/mutations.ts — is responsible for rejecting a request that
 * exceeds business_unit_pos_config's own policy limits *before* calling
 * this; this function's cap is a last-resort mathematical guarantee, not
 * the policy check itself).
 */
export function calculateDiscount(subtotal: number, discount?: CartDiscountInput): number {
  if (!discount || subtotal <= 0) return 0

  const manual =
    discount.amount !== undefined
      ? discount.amount
      : discount.percentage
        ? subtotal * (discount.percentage / 100)
        : 0

  const raw = manual + (discount.couponAmount ?? 0)

  return round2(Math.min(Math.max(0, raw), subtotal))
}

/** `taxRatePercent` is business_unit_pos_config.tax_rate (0-100). */
export function calculateTax(postDiscountSubtotal: number, taxRatePercent: number): number {
  if (postDiscountSubtotal <= 0 || taxRatePercent <= 0) return 0
  return round2(postDiscountSubtotal * (taxRatePercent / 100))
}

export interface ServiceChargeConfig {
  enabled: boolean
  type: 'percentage' | 'fixed'
  value: number
}

/**
 * A disabled service charge is always 0 regardless of `value`/`type` —
 * business_unit_pos_config.service_charge_enabled is the single source of
 * truth for whether this Business Unit applies one at all (e.g. most
 * verticals other than restaurants/hotels leave it off).
 */
export function calculateServiceCharge(
  postDiscountSubtotal: number,
  config: ServiceChargeConfig,
): number {
  if (!config.enabled || postDiscountSubtotal <= 0 || config.value <= 0) return 0

  return config.type === 'fixed'
    ? round2(config.value)
    : round2(postDiscountSubtotal * (config.value / 100))
}

export interface PosConfigForCalc {
  taxRate: number
  serviceChargeEnabled: boolean
  serviceChargeType: 'percentage' | 'fixed'
  serviceChargeValue: number
}

export interface SaleTotals {
  subtotal: number
  discountAmount: number
  taxAmount: number
  serviceChargeAmount: number
  total: number
  lineItems: SaleLineItemCalcResult[]
}

/**
 * The single entry point every caller (checkout, receipt, reports) should
 * use rather than composing the pieces above individually — the one place
 * the documented order above is actually applied end to end.
 */
export function calculateSaleTotals(
  items: SaleLineItemCalcInput[],
  discount: CartDiscountInput | undefined,
  posConfig: PosConfigForCalc,
): SaleTotals {
  const lineItems = items.map(calculateLineTotal)
  const subtotal = round2(lineItems.reduce((sum, item) => sum + item.lineTotal, 0))

  const discountAmount = calculateDiscount(subtotal, discount)
  const postDiscountSubtotal = round2(Math.max(0, subtotal - discountAmount))

  const taxAmount = calculateTax(postDiscountSubtotal, posConfig.taxRate)
  const serviceChargeAmount = calculateServiceCharge(postDiscountSubtotal, {
    enabled: posConfig.serviceChargeEnabled,
    type: posConfig.serviceChargeType,
    value: posConfig.serviceChargeValue,
  })

  const total = round2(postDiscountSubtotal + taxAmount + serviceChargeAmount)

  return { subtotal, discountAmount, taxAmount, serviceChargeAmount, total, lineItems }
}
