/**
 * The intermediate accounting module — docs/PRD.md §27's list (revenue, COGS,
 * gross profit, expenses, net profit, payment summaries, store credit
 * balances, layaway balances), and explicitly not a full accounting ERP
 * (docs/PRD.md §5).
 *
 * Pure, in the same sense and for the same reason as lib/sales/calculations.ts
 * and lib/customers/ledger.ts: no database, no `async`, no imports outside
 * this file's own types. Every function is value-in/value-out, so
 * tests/unit/reports/accounting.test.ts can assert the arithmetic against
 * docs/Financial_Architecture_Accounting_Reconciliation.md §31–34's own worked
 * examples without a database anywhere near it.
 *
 * THE DIVISION OF LABOUR WITH SQL IS THE DESIGN. The report functions in
 * supabase/migrations/20260823141000_create_report_functions.sql *sum*, and
 * they do not *derive* — `report_accounting_aggregates()` returns raw totals
 * (gross sales, discounts, cost of goods sold, refunds, expenses) and no
 * computed figure. Every subtraction that defines profit happens here. The
 * summation has to happen in Postgres (see that file's header on `max_rows`);
 * the arithmetic does not, and putting it here is what makes it testable. A
 * `gross_profit` column in SQL would be a second, untested implementation of
 * the rule, free to disagree with this one.
 *
 * CALCULATION ORDER, following lib/sales/calculations.ts's locked
 * subtotal -> discount -> tax -> service charge -> total:
 *
 *   revenue (net sales) = gross sales − discounts
 *   net sales after refunds = revenue − approved refunds        (§32)
 *   COGS = cost of goods sold − cost of goods returned
 *   gross profit = net sales after refunds − COGS               (§33)
 *   net profit = gross profit − approved expenses               (§34)
 *
 * Two things are deliberately NOT revenue, and both are the kind of mistake
 * that makes a P&L look healthier than the business is:
 *
 *   TAX (§29) — "Tax collected from customers is not automatically business
 *   revenue." It is money held on behalf of the tax authority. Reported as
 *   `taxPayable`, a liability, never added to revenue.
 *
 *   SERVICE CHARGE (§30) — the same argument; in the hospitality settings that
 *   use it, service charge is typically owed onward to staff. §30 says its
 *   classification "should be explicit configuration", and
 *   `business_unit_pos_config` has no column for that today. Rather than
 *   invent one in a reporting milestone, this module classifies it as
 *   non-revenue and reports it separately, which is the conservative reading;
 *   making it configurable belongs with Milestone 11's configuration work.
 *
 * COST BASIS is `sale_items.unit_cost`, the snapshot captured at time of sale
 * (supabase/migrations/20260823140600). It is deliberately not the live
 * `products.cost_price` — see that migration's header. Weighted-average
 * costing (§11–12) is out of scope for this milestone and is tracked
 * separately; what is implemented here is snapshot costing, and the module
 * says so rather than implying a sophistication it does not have.
 */

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * The raw sums from `report_accounting_aggregates()`. Every field is a total
 * over the reporting period, already scoped by RLS to what the caller may see.
 */
export interface AccountingAggregates {
  saleCount: number
  /** Σ sales.subtotal — already net of per-line discounts, before the order-level one. */
  grossSales: number
  /** Σ sale_items.line_discount. */
  lineDiscounts: number
  /** Σ sales.discount_amount. */
  orderDiscounts: number
  taxCollected: number
  serviceChargeCollected: number
  /** Σ(quantity × unit_cost) over sale items. */
  saleCogs: number
  /** Σ(returned quantity × unit_cost) — cost that came back through the door. */
  returnCogs: number
  refundsApproved: number
  refundCount: number
  expensesApproved: number
  expenseCount: number
}

export interface PaymentSummaryRow {
  method: string
  count: number
  amount: number
}

export interface StoreCreditRow {
  balance: number
  issued: number
  spent: number
}

export interface LayawayRow {
  status: 'active' | 'paid' | 'cancelled'
  totalAmount: number
  amountPaid: number
}

// ---------------------------------------------------------------------------
// Derivations — docs/Financial_Architecture_Accounting_Reconciliation.md §31–34
// ---------------------------------------------------------------------------

/**
 * True gross sales: what would have been charged before any discount at all.
 * `grossSales` arrives already net of line discounts (that is what
 * `sales.subtotal` is), so they are added back to reach the pre-discount
 * figure — otherwise line discounts would be invisible in the report, having
 * been quietly absorbed before anyone could see them.
 */
export function deriveGrossSales(aggregates: AccountingAggregates): number {
  return round2(aggregates.grossSales + aggregates.lineDiscounts)
}

/** Both discount layers together — §31's "discounts" line. */
export function deriveDiscounts(aggregates: AccountingAggregates): number {
  return round2(aggregates.lineDiscounts + aggregates.orderDiscounts)
}

/**
 * §31's net sales: gross less discounts. Equivalently
 * `subtotal − discount_amount`, and equivalently `total − tax − service
 * charge` — the three agree by construction because
 * lib/sales/calculations.ts computed them from each other. This is the figure
 * the rest of the module calls revenue.
 */
export function deriveNetSales(grossSales: number, discounts: number): number {
  return round2(grossSales - discounts)
}

/** §32: only approved refunds are money that actually left the business. */
export function deriveNetSalesAfterRefunds(netSales: number, refunds: number): number {
  return round2(netSales - refunds)
}

/**
 * Cost of goods actually sold and kept. Returned goods are subtracted because
 * their cost is back on the shelf — leaving it in would understate profit for
 * every period in which a customer changed their mind.
 */
export function deriveCogs(aggregates: AccountingAggregates): number {
  return round2(aggregates.saleCogs - aggregates.returnCogs)
}

/** §33. */
export function deriveGrossProfit(netSalesAfterRefunds: number, cogs: number): number {
  return round2(netSalesAfterRefunds - cogs)
}

/** §34. See `AccountingSummary.netProfitLabel` for why this is an estimate. */
export function deriveNetProfit(grossProfit: number, expenses: number): number {
  return round2(grossProfit - expenses)
}

/** §29 — a liability, not revenue. */
export function deriveTaxPayable(aggregates: AccountingAggregates): number {
  return round2(aggregates.taxCollected)
}

/** §30 — reported separately, not revenue. See this module's header. */
export function deriveServiceCharge(aggregates: AccountingAggregates): number {
  return round2(aggregates.serviceChargeCollected)
}

export interface PaymentSummary {
  methods: PaymentSummaryRow[]
  totalCount: number
  totalAmount: number
}

export function summarizePayments(rows: readonly PaymentSummaryRow[]): PaymentSummary {
  return {
    methods: rows.map((row) => ({ ...row, amount: round2(row.amount) })),
    totalCount: rows.reduce((sum, row) => sum + row.count, 0),
    totalAmount: round2(rows.reduce((sum, row) => sum + row.amount, 0)),
  }
}

export interface StoreCreditSummary {
  /** What the business currently owes customers in credit — a liability. */
  outstanding: number
  issued: number
  spent: number
  accountCount: number
}

export function summarizeStoreCredit(rows: readonly StoreCreditRow[]): StoreCreditSummary {
  return {
    outstanding: round2(rows.reduce((sum, row) => sum + row.balance, 0)),
    issued: round2(rows.reduce((sum, row) => sum + row.issued, 0)),
    spent: round2(rows.reduce((sum, row) => sum + row.spent, 0)),
    accountCount: rows.length,
  }
}

export interface LayawaySummary {
  activeCount: number
  /** Total value of goods reserved under active layaways. */
  committed: number
  /** Installments already taken against those active layaways. */
  collected: number
  /** Still owed by customers on active layaways. */
  outstanding: number
}

/**
 * Cancelled and completed layaways are excluded: a cancelled one reserves
 * nothing and owes nothing, and a paid one has already become a sale. Only
 * active layaways represent a live commitment on either side.
 */
export function summarizeLayaways(rows: readonly LayawayRow[]): LayawaySummary {
  const active = rows.filter((row) => row.status === 'active')

  const committed = active.reduce((sum, row) => sum + row.totalAmount, 0)
  const collected = active.reduce((sum, row) => sum + row.amountPaid, 0)

  return {
    activeCount: active.length,
    committed: round2(committed),
    collected: round2(collected),
    outstanding: round2(committed - collected),
  }
}

// ---------------------------------------------------------------------------
// The single entry point
// ---------------------------------------------------------------------------

export interface AccountingSummaryInput {
  aggregates: AccountingAggregates
  payments?: readonly PaymentSummaryRow[]
  storeCredit?: readonly StoreCreditRow[]
  layaways?: readonly LayawayRow[]
}

export interface AccountingSummary {
  saleCount: number
  grossSales: number
  discounts: number
  /** §31's net sales — the figure this product calls revenue. */
  revenue: number
  refunds: number
  refundCount: number
  netSalesAfterRefunds: number
  cogs: number
  grossProfit: number
  expenses: number
  expenseCount: number
  netProfit: number
  /**
   * §34 calls this "estimated operational profit" rather than net profit, and
   * so does the UI. The honesty matters: this figure excludes depreciation,
   * payroll that is not recorded as an expense, and anything else a real P&L
   * would carry. Calling it "net profit" unqualified would invite an owner to
   * file taxes on it.
   */
  netProfitLabel: string
  taxPayable: number
  serviceCharge: number
  payments: PaymentSummary
  storeCredit: StoreCreditSummary
  layaways: LayawaySummary
}

/**
 * The one place the documented order above is applied end to end — what
 * `calculateSaleTotals()` is to lib/sales/calculations.ts. Callers should use
 * this rather than composing the derivations individually, so there is exactly
 * one definition of how the figures relate.
 */
export function buildAccountingSummary(input: AccountingSummaryInput): AccountingSummary {
  const { aggregates } = input

  const grossSales = deriveGrossSales(aggregates)
  const discounts = deriveDiscounts(aggregates)
  const revenue = deriveNetSales(grossSales, discounts)
  const refunds = round2(aggregates.refundsApproved)
  const netSalesAfterRefunds = deriveNetSalesAfterRefunds(revenue, refunds)
  const cogs = deriveCogs(aggregates)
  const grossProfit = deriveGrossProfit(netSalesAfterRefunds, cogs)
  const expenses = round2(aggregates.expensesApproved)

  return {
    saleCount: aggregates.saleCount,
    grossSales,
    discounts,
    revenue,
    refunds,
    refundCount: aggregates.refundCount,
    netSalesAfterRefunds,
    cogs,
    grossProfit,
    expenses,
    expenseCount: aggregates.expenseCount,
    netProfit: deriveNetProfit(grossProfit, expenses),
    netProfitLabel: 'Estimated operational profit',
    taxPayable: deriveTaxPayable(aggregates),
    serviceCharge: deriveServiceCharge(aggregates),
    payments: summarizePayments(input.payments ?? []),
    storeCredit: summarizeStoreCredit(input.storeCredit ?? []),
    layaways: summarizeLayaways(input.layaways ?? []),
  }
}

/** A zeroed aggregate set — the shape an empty period produces. */
export const EMPTY_AGGREGATES: AccountingAggregates = {
  saleCount: 0,
  grossSales: 0,
  lineDiscounts: 0,
  orderDiscounts: 0,
  taxCollected: 0,
  serviceChargeCollected: 0,
  saleCogs: 0,
  returnCogs: 0,
  refundsApproved: 0,
  refundCount: 0,
  expensesApproved: 0,
  expenseCount: 0,
}
