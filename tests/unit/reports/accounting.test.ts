import { describe, expect, it } from 'vitest'

import {
  EMPTY_AGGREGATES,
  buildAccountingSummary,
  deriveCogs,
  deriveDiscounts,
  deriveGrossProfit,
  deriveGrossSales,
  deriveNetProfit,
  deriveNetSales,
  deriveNetSalesAfterRefunds,
  summarizeLayaways,
  summarizePayments,
  summarizeStoreCredit,
  type AccountingAggregates,
} from '@/lib/reports/accounting'

/**
 * Milestone 10's Testing Requirements: "accounting calculation correctness
 * (revenue, COGS, gross profit, net profit) against known seeded
 * transactional scenarios".
 *
 * The scenarios below are deliberately not invented — the first four are
 * docs/Financial_Architecture_Accounting_Reconciliation.md §31–34's own
 * worked examples, transcribed. If this suite and that document ever
 * disagree, the document is the specification and this code is wrong.
 */

function aggregates(overrides: Partial<AccountingAggregates> = {}): AccountingAggregates {
  return { ...EMPTY_AGGREGATES, ...overrides }
}

describe('the design corpus’ worked examples', () => {
  it('§31: gross ₦20,000 less ₦2,000 discount is ₦18,000 net — and retains all three', () => {
    // The section's actual point: "This is much more useful than simply
    // storing ₦18,000." A summary that only reported net sales would pass a
    // naive test and still be the wrong report.
    const summary = buildAccountingSummary({
      // `grossSales` is sales.subtotal, which for an order-level discount is
      // still the full ₦20,000 — MS08 records the discount separately rather
      // than folding it into the subtotal.
      aggregates: aggregates({ saleCount: 1, grossSales: 20_000, orderDiscounts: 2_000 }),
    })

    expect(summary.grossSales).toBe(20_000)
    expect(summary.discounts).toBe(2_000)
    expect(summary.revenue).toBe(18_000)
  })

  it('§32: a ₦50,000 sale with a ₦10,000 refund nets ₦40,000, sale untouched', () => {
    const summary = buildAccountingSummary({
      aggregates: aggregates({
        saleCount: 1,
        grossSales: 50_000,
        refundsApproved: 10_000,
        refundCount: 1,
      }),
    })

    expect(summary.grossSales).toBe(50_000)
    expect(summary.refunds).toBe(10_000)
    expect(summary.netSalesAfterRefunds).toBe(40_000)
    // "The original sale remains untouched" — revenue still reports what was
    // actually sold; the refund is a separate, visible line.
    expect(summary.revenue).toBe(50_000)
  })

  it('§33: net sales ₦10,000,000 less COGS ₦6,000,000 is ₦4,000,000 gross profit', () => {
    const summary = buildAccountingSummary({
      aggregates: aggregates({ saleCount: 1, grossSales: 10_000_000, saleCogs: 6_000_000 }),
    })

    expect(summary.netSalesAfterRefunds).toBe(10_000_000)
    expect(summary.cogs).toBe(6_000_000)
    expect(summary.grossProfit).toBe(4_000_000)
  })

  it('§34: gross profit ₦4,000,000 less ₦1,500,000 expenses is ₦2,500,000', () => {
    const summary = buildAccountingSummary({
      aggregates: aggregates({
        saleCount: 1,
        grossSales: 10_000_000,
        saleCogs: 6_000_000,
        expensesApproved: 1_500_000,
        expenseCount: 3,
      }),
    })

    expect(summary.netProfit).toBe(2_500_000)
    // §34 calls it an operational estimate, and so must the UI.
    expect(summary.netProfitLabel).toBe('Estimated operational profit')
  })
})

describe('tax and service charge are not revenue', () => {
  it('§29: tax collected is reported as payable and excluded from revenue', () => {
    const summary = buildAccountingSummary({
      aggregates: aggregates({ saleCount: 1, grossSales: 10_000, taxCollected: 750 }),
    })

    expect(summary.revenue).toBe(10_000)
    expect(summary.taxPayable).toBe(750)
  })

  it('§30: service charge is reported separately and excluded from revenue', () => {
    const summary = buildAccountingSummary({
      aggregates: aggregates({ saleCount: 1, grossSales: 10_000, serviceChargeCollected: 500 }),
    })

    expect(summary.revenue).toBe(10_000)
    expect(summary.serviceCharge).toBe(500)
  })

  it('neither leaks into profit, even together', () => {
    const summary = buildAccountingSummary({
      aggregates: aggregates({
        saleCount: 1,
        grossSales: 10_000,
        saleCogs: 4_000,
        taxCollected: 750,
        serviceChargeCollected: 500,
      }),
    })

    expect(summary.grossProfit).toBe(6_000)
    expect(summary.netProfit).toBe(6_000)
  })
})

describe('discount layers', () => {
  it('adds line discounts back to reach true gross sales', () => {
    // sales.subtotal already has line discounts removed (MS08's model), so a
    // report that took it at face value would show a smaller gross than was
    // ever quoted and hide the till-level discounting entirely.
    const summary = buildAccountingSummary({
      aggregates: aggregates({ saleCount: 1, grossSales: 9_000, lineDiscounts: 1_000 }),
    })

    expect(summary.grossSales).toBe(10_000)
    expect(summary.discounts).toBe(1_000)
    expect(summary.revenue).toBe(9_000)
  })

  it('counts line and order discounts together', () => {
    const summary = buildAccountingSummary({
      aggregates: aggregates({
        saleCount: 1,
        grossSales: 9_000,
        lineDiscounts: 1_000,
        orderDiscounts: 500,
      }),
    })

    expect(summary.grossSales).toBe(10_000)
    expect(summary.discounts).toBe(1_500)
    expect(summary.revenue).toBe(8_500)
  })
})

describe('COGS', () => {
  it('subtracts the cost of returned goods', () => {
    const summary = buildAccountingSummary({
      aggregates: aggregates({
        saleCount: 2,
        grossSales: 10_000,
        saleCogs: 6_000,
        returnCogs: 1_500,
      }),
    })

    expect(summary.cogs).toBe(4_500)
    expect(summary.grossProfit).toBe(5_500)
  })

  it('treats a zero unit cost as zero cost, not as missing data', () => {
    // Rows backfilled by 20260823140600 for products whose cost was never
    // recorded carry unit_cost 0. Gross profit then equals revenue, which is
    // optimistic but honest — and must not become NaN or silently drop the row.
    const summary = buildAccountingSummary({
      aggregates: aggregates({ saleCount: 1, grossSales: 5_000, saleCogs: 0 }),
    })

    expect(summary.cogs).toBe(0)
    expect(summary.grossProfit).toBe(5_000)
  })

  it('handles a fully returned sale: no profit, no loss', () => {
    const summary = buildAccountingSummary({
      aggregates: aggregates({
        saleCount: 1,
        grossSales: 5_000,
        saleCogs: 3_000,
        returnCogs: 3_000,
        refundsApproved: 5_000,
        refundCount: 1,
      }),
    })

    expect(summary.netSalesAfterRefunds).toBe(0)
    expect(summary.cogs).toBe(0)
    expect(summary.grossProfit).toBe(0)
  })
})

describe('an empty period', () => {
  it('reports zeros rather than NaN or nulls', () => {
    const summary = buildAccountingSummary({ aggregates: EMPTY_AGGREGATES })

    expect(summary.revenue).toBe(0)
    expect(summary.cogs).toBe(0)
    expect(summary.grossProfit).toBe(0)
    expect(summary.netProfit).toBe(0)
    expect(summary.payments.totalAmount).toBe(0)
    expect(summary.storeCredit.outstanding).toBe(0)
    expect(summary.layaways.outstanding).toBe(0)
  })
})

describe('rounding', () => {
  it('rounds every derived figure to money precision', () => {
    // 0.1 + 0.2 territory: without explicit rounding these surface as
    // 8999.999999999998 in an export.
    const summary = buildAccountingSummary({
      aggregates: aggregates({
        saleCount: 3,
        grossSales: 10_000.1,
        lineDiscounts: 0.2,
        saleCogs: 3_333.33,
      }),
    })

    expect(summary.grossSales).toBe(10_000.3)
    expect(summary.revenue).toBe(10_000.1)
    expect(summary.grossProfit).toBe(6_666.77)
  })
})

describe('payment, store credit and layaway summaries', () => {
  it('totals payments across methods', () => {
    const summary = summarizePayments([
      { method: 'cash', count: 3, amount: 12_000 },
      { method: 'card', count: 1, amount: 5_500 },
    ])

    expect(summary.totalCount).toBe(4)
    expect(summary.totalAmount).toBe(17_500)
    expect(summary.methods).toHaveLength(2)
  })

  it('reports outstanding store credit as the liability it is', () => {
    const summary = summarizeStoreCredit([
      { balance: 2_000, issued: 5_000, spent: 3_000 },
      { balance: 500, issued: 500, spent: 0 },
    ])

    expect(summary.outstanding).toBe(2_500)
    expect(summary.issued).toBe(5_500)
    expect(summary.spent).toBe(3_000)
    expect(summary.accountCount).toBe(2)
  })

  it('counts only active layaways as a live commitment', () => {
    const summary = summarizeLayaways([
      { status: 'active', totalAmount: 10_000, amountPaid: 4_000 },
      { status: 'active', totalAmount: 6_000, amountPaid: 1_000 },
      { status: 'paid', totalAmount: 20_000, amountPaid: 20_000 },
      { status: 'cancelled', totalAmount: 8_000, amountPaid: 2_000 },
    ])

    expect(summary.activeCount).toBe(2)
    expect(summary.committed).toBe(16_000)
    expect(summary.collected).toBe(5_000)
    expect(summary.outstanding).toBe(11_000)
  })
})

describe('the individual derivations compose to the same answer as the entry point', () => {
  it('agrees with buildAccountingSummary step for step', () => {
    // Guards against the entry point quietly drifting from the pieces it is
    // documented to apply — the failure mode that made a single entry point
    // worth having in the first place.
    const input = aggregates({
      saleCount: 12,
      grossSales: 480_000,
      lineDiscounts: 12_000,
      orderDiscounts: 8_000,
      saleCogs: 300_000,
      returnCogs: 20_000,
      refundsApproved: 30_000,
      refundCount: 2,
      expensesApproved: 45_000,
      expenseCount: 4,
    })

    const gross = deriveGrossSales(input)
    const discounts = deriveDiscounts(input)
    const net = deriveNetSales(gross, discounts)
    const afterRefunds = deriveNetSalesAfterRefunds(net, input.refundsApproved)
    const cogs = deriveCogs(input)
    const grossProfit = deriveGrossProfit(afterRefunds, cogs)
    const netProfit = deriveNetProfit(grossProfit, input.expensesApproved)

    const summary = buildAccountingSummary({ aggregates: input })

    expect(summary.grossSales).toBe(gross)
    expect(summary.discounts).toBe(discounts)
    expect(summary.revenue).toBe(net)
    expect(summary.netSalesAfterRefunds).toBe(afterRefunds)
    expect(summary.cogs).toBe(cogs)
    expect(summary.grossProfit).toBe(grossProfit)
    expect(summary.netProfit).toBe(netProfit)
  })
})
