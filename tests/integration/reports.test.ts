import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

import { buildAccountingSummary, type AccountingAggregates } from '@/lib/reports/accounting'
import { pool, withTransaction } from './helpers/db'

/**
 * Milestone 10's Testing Requirements: "each standard report returns correct,
 * correctly-scoped data for a given seeded dataset", and "accounting
 * calculations reconcile correctly against the transactional and ledger data".
 *
 * Correctness lives here; *scoping* lives in reports-security.test.ts. The
 * split matters because these tests run as `postgres` over a raw `pg` pool,
 * which bypasses RLS entirely — exactly right for asking "does the arithmetic
 * agree with the rows", and exactly wrong for asking "can a branch manager see
 * another branch". Proving the second needs real signed-in users, which is
 * what that file does.
 *
 * The seed below is one fixed scenario with hand-computable answers, described
 * in `SEED` so a failing assertion can be checked against arithmetic rather
 * than against another query.
 */

/**
 * Branch A: product costing 300, selling at 500.
 *   Sale 1 — 2 units, ₦100 order discount, ₦50 tax, ₦25 service charge
 *   Sale 2 — 1 unit, no discount
 *   Return — 1 unit off Sale 1
 *   Refunds — ₦500 approved, ₦100 still pending
 * Branch B: product costing 200, selling at 400.
 *   Sale 3 — 3 units
 * Expenses — ₦250 approved, ₦80 pending, ₦999 approved then voided
 */
const SEED = {
  productACost: 300,
  productAPrice: 500,
  productBCost: 200,
  productBPrice: 400,
  orderDiscount: 100,
  tax: 50,
  serviceCharge: 25,
  approvedRefund: 500,
  pendingRefund: 100,
  approvedExpense: 250,
  pendingExpense: 80,
  voidedExpense: 999,
}

const EXPECTED = {
  saleCount: 3,
  /** 1000 + 500 + 1200 */
  grossSales: 2_700,
  orderDiscounts: SEED.orderDiscount,
  /** (2 × 300) + (1 × 300) + (3 × 200) */
  saleCogs: 1_500,
  /** 1 × 300 */
  returnCogs: 300,
  revenue: 2_600,
  netSalesAfterRefunds: 2_100,
  cogs: 1_200,
  grossProfit: 900,
  netProfit: 650,
}

interface Seeded {
  organizationId: string
  branchAId: string
  branchBId: string
  businessUnitAId: string
  businessUnitBId: string
  productAId: string
  productBId: string
  sale1Id: string
}

async function seed(client: PoolClient): Promise<Seeded> {
  const suffix = randomUUID().slice(0, 8)

  const businessType = await client.query(
    `select id from public.business_types where slug = 'supermarket'`,
  )
  const typeId = businessType.rows[0].id

  const org = await client.query(
    `insert into public.organizations (name, slug) values ('Reports Org', $1) returning id`,
    [`reports-org-${suffix}`],
  )
  const organizationId = org.rows[0].id as string

  // One insert per row rather than a multi-row VALUES: `RETURNING` has no
  // ORDER BY, so a multi-row insert gives back ids in an order the test would
  // have to guess at.
  const insertBranch = async (name: string, slug: string) =>
    (
      await client.query(
        `insert into public.branches (organization_id, name, slug) values ($1, $2, $3) returning id`,
        [organizationId, name, slug],
      )
    ).rows[0].id as string

  const branchAId = await insertBranch('Branch A', `reports-a-${suffix}`)
  const branchBId = await insertBranch('Branch B', `reports-b-${suffix}`)

  const insertUnit = async (branchId: string, name: string, slug: string) =>
    (
      await client.query(
        `insert into public.business_units (branch_id, business_type_id, name, slug)
         values ($1, $2, $3, $4) returning id`,
        [branchId, typeId, name, slug],
      )
    ).rows[0].id as string

  const businessUnitAId = await insertUnit(branchAId, 'Unit A', `reports-ua-${suffix}`)
  const businessUnitBId = await insertUnit(branchBId, 'Unit B', `reports-ub-${suffix}`)

  const insertProduct = async (
    businessUnitId: string,
    name: string,
    sku: string,
    price: number,
    cost: number,
  ) =>
    (
      await client.query(
        `insert into public.products (business_unit_id, name, sku, base_price, cost_price)
         values ($1, $2, $3, $4, $5) returning id`,
        [businessUnitId, name, sku, price, cost],
      )
    ).rows[0].id as string

  const productAId = await insertProduct(
    businessUnitAId,
    'Product A',
    `RPT-A-${suffix}`,
    SEED.productAPrice,
    SEED.productACost,
  )
  const productBId = await insertProduct(
    businessUnitBId,
    'Product B',
    `RPT-B-${suffix}`,
    SEED.productBPrice,
    SEED.productBCost,
  )

  for (const [branchId, productId] of [
    [branchAId, productAId],
    [branchBId, productBId],
  ]) {
    await client.query(
      `select public.record_inventory_movement($1, $2, null, 'ADJUSTMENT', 100, 'seed', null, null)`,
      [branchId, productId],
    )
  }

  const sale1 = await createSale(client, {
    organizationId,
    branchId: branchAId,
    businessUnitId: businessUnitAId,
    productId: productAId,
    quantity: 2,
    unitPrice: SEED.productAPrice,
    discount: SEED.orderDiscount,
    tax: SEED.tax,
    serviceCharge: SEED.serviceCharge,
  })
  const sale1Id = sale1.id

  await createSale(client, {
    organizationId,
    branchId: branchAId,
    businessUnitId: businessUnitAId,
    productId: productAId,
    quantity: 1,
    unitPrice: SEED.productAPrice,
  })

  await createSale(client, {
    organizationId,
    branchId: branchBId,
    businessUnitId: businessUnitBId,
    productId: productBId,
    quantity: 3,
    unitPrice: SEED.productBPrice,
  })

  // One unit back off sale 1 — reverses its share of COGS.
  const saleItem = await client.query(
    `select id from public.sale_items where sale_id = $1 limit 1`,
    [sale1Id],
  )
  await client.query(`select public.create_return($1, 'changed mind', $2::jsonb)`, [
    sale1Id,
    JSON.stringify([{ sale_item_id: saleItem.rows[0].id, quantity: 1, reason: 'changed mind' }]),
  ])

  const approvedRefund = await client.query(
    `select * from public.request_refund($1, null, $2, 'cash', 'partial refund')`,
    [sale1Id, SEED.approvedRefund],
  )
  await client.query(`select public.decide_refund($1, true)`, [approvedRefund.rows[0].id])

  // Left pending on purpose: a requested refund is not money that has left.
  await client.query(`select public.request_refund($1, null, $2, 'cash', 'still deciding')`, [
    sale1Id,
    SEED.pendingRefund,
  ])

  const insertExpense = async (category: string, amount: number, method: string) =>
    (
      await client.query(
        `insert into public.expenses
           (organization_id, branch_id, business_unit_id, category, amount, payment_method, expense_date)
         values ($1, $2, $3, $4, $5, $6, current_date) returning id`,
        [organizationId, branchAId, businessUnitAId, category, amount, method],
      )
    ).rows[0].id as string

  const approvedExpenseId = await insertExpense('Electricity', SEED.approvedExpense, 'cash')
  // Left pending deliberately — a claim is not yet a cost.
  await insertExpense('Transport', SEED.pendingExpense, 'cash')
  const voidedExpenseId = await insertExpense('Maintenance', SEED.voidedExpense, 'transfer')

  await client.query(`select public.decide_expense($1, true, null)`, [approvedExpenseId])
  // Approved first, then voided: the case that proves a withdrawn expense
  // leaves the approved total rather than merely never joining it.
  await client.query(`select public.decide_expense($1, true, null)`, [voidedExpenseId])
  await client.query(`select public.void_expense($1, 'recorded in error')`, [voidedExpenseId])

  return {
    organizationId,
    branchAId,
    branchBId,
    businessUnitAId,
    businessUnitBId,
    productAId,
    productBId,
    sale1Id,
  }
}

async function createSale(
  client: PoolClient,
  params: {
    organizationId: string
    branchId: string
    businessUnitId: string
    productId: string
    quantity: number
    unitPrice: number
    discount?: number
    tax?: number
    serviceCharge?: number
  },
): Promise<{ id: string }> {
  const subtotal = params.quantity * params.unitPrice
  const discount = params.discount ?? 0
  const tax = params.tax ?? 0
  const serviceCharge = params.serviceCharge ?? 0
  const total = subtotal - discount + tax + serviceCharge

  const result = await client.query(
    `select * from public.create_sale($1, $2, $3, $4, $5::jsonb, $6, $7, null, $8, $9, $10, 'cash', $10, null, null)`,
    [
      params.organizationId,
      params.branchId,
      params.businessUnitId,
      randomUUID(),
      JSON.stringify([
        {
          product_id: params.productId,
          variant_id: null,
          quantity: params.quantity,
          unit_price: params.unitPrice,
          line_discount: 0,
          line_total: subtotal,
        },
      ]),
      subtotal,
      discount,
      tax,
      serviceCharge,
      total,
    ],
  )

  return { id: result.rows[0].id as string }
}

function n(value: unknown): number {
  return Number(value)
}

afterAll(async () => {
  await pool.end()
})

describe('create_sale() now snapshots unit cost', () => {
  it('captures the product cost on every sale item', async () => {
    await withTransaction(async (client) => {
      const { sale1Id } = await seed(client)

      const items = await client.query(
        `select quantity, unit_cost from public.sale_items where sale_id = $1`,
        [sale1Id],
      )

      expect(n(items.rows[0].unit_cost)).toBe(SEED.productACost)
    })
  })

  it('leaves the snapshot untouched when the product cost later changes', async () => {
    // The whole reason the column exists: a cost edit today must not rewrite
    // last month's gross profit.
    await withTransaction(async (client) => {
      const { productAId, sale1Id } = await seed(client)

      await client.query(`update public.products set cost_price = 9999 where id = $1`, [productAId])

      const items = await client.query(
        `select unit_cost from public.sale_items where sale_id = $1`,
        [sale1Id],
      )
      expect(n(items.rows[0].unit_cost)).toBe(SEED.productACost)
    })
  })
})

describe('report_sales_by_scope', () => {
  it('groups by branch with correct money columns', async () => {
    await withTransaction(async (client) => {
      const { organizationId } = await seed(client)

      const result = await client.query(
        `select * from public.report_sales_by_scope($1, null, null, null, null, 'branch', 500)`,
        [organizationId],
      )

      expect(result.rows).toHaveLength(2)

      const byLabel = Object.fromEntries(result.rows.map((row) => [row.group_label, row]))
      const branchA = byLabel['Branch A']
      const branchB = byLabel['Branch B']

      // Branch A: sale 1 (1000) + sale 2 (500)
      expect(n(branchA.sale_count)).toBe(2)
      expect(n(branchA.gross_sales)).toBe(1_500)
      expect(n(branchA.discount_amount)).toBe(SEED.orderDiscount)
      expect(n(branchA.net_sales)).toBe(1_400)
      expect(n(branchA.tax_amount)).toBe(SEED.tax)
      expect(n(branchA.service_charge_amount)).toBe(SEED.serviceCharge)

      expect(n(branchB.sale_count)).toBe(1)
      expect(n(branchB.gross_sales)).toBe(1_200)
      expect(n(branchB.net_sales)).toBe(1_200)
    })
  })

  it('filters to a single branch when asked', async () => {
    await withTransaction(async (client) => {
      const { organizationId, branchBId } = await seed(client)

      const result = await client.query(
        `select * from public.report_sales_by_scope($1, $2, null, null, null, 'branch', 500)`,
        [organizationId, branchBId],
      )

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].group_label).toBe('Branch B')
    })
  })

  it('respects a date range', async () => {
    await withTransaction(async (client) => {
      const { organizationId } = await seed(client)

      const past = await client.query(
        `select * from public.report_sales_by_scope($1, null, null, '2020-01-01'::timestamptz, '2020-02-01'::timestamptz, 'day', 500)`,
        [organizationId],
      )
      expect(past.rows).toHaveLength(0)
    })
  })

  it('rejects an unsupported grouping', async () => {
    await withTransaction(async (client) => {
      const { organizationId } = await seed(client)

      await expect(
        client.query(
          `select * from public.report_sales_by_scope($1, null, null, null, null, 'cost_price', 500)`,
          [organizationId],
        ),
      ).rejects.toThrow(/unsupported sales grouping/)
    })
  })
})

describe('report_sales_by_item', () => {
  it('reports quantity, cost of goods and margin per product', async () => {
    await withTransaction(async (client) => {
      const { organizationId } = await seed(client)

      const result = await client.query(
        `select * from public.report_sales_by_item($1, null, null, null, null, 'product', 500)`,
        [organizationId],
      )

      const byLabel = Object.fromEntries(result.rows.map((row) => [row.group_label, row]))

      // Product A: 3 units sold across two sales at 500, costing 300 each.
      expect(n(byLabel['Product A'].quantity_sold)).toBe(3)
      expect(n(byLabel['Product A'].net_sales)).toBe(1_500)
      expect(n(byLabel['Product A'].cogs)).toBe(900)
      expect(n(byLabel['Product A'].gross_profit)).toBe(600)

      expect(n(byLabel['Product B'].quantity_sold)).toBe(3)
      expect(n(byLabel['Product B'].cogs)).toBe(600)
      expect(n(byLabel['Product B'].gross_profit)).toBe(600)
    })
  })

  it('groups uncategorised products into one explicit bucket', async () => {
    await withTransaction(async (client) => {
      const { organizationId } = await seed(client)

      const result = await client.query(
        `select * from public.report_sales_by_item($1, null, null, null, null, 'category', 500)`,
        [organizationId],
      )

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].group_label).toBe('Uncategorised')
      expect(n(result.rows[0].quantity_sold)).toBe(6)
    })
  })
})

describe('report_sales_by_payment_method', () => {
  it('totals by method', async () => {
    await withTransaction(async (client) => {
      const { organizationId } = await seed(client)

      const result = await client.query(
        `select * from public.report_sales_by_payment_method($1, null, null, null, null, 500)`,
        [organizationId],
      )

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].group_key).toBe('cash')
      expect(result.rows[0].group_label).toBe('Cash')
      expect(n(result.rows[0].payment_count)).toBe(3)
      // 975 + 500 + 1200
      expect(n(result.rows[0].amount)).toBe(2_675)
    })
  })
})

describe('report_expenses', () => {
  it('separates approved, pending and voided amounts', async () => {
    await withTransaction(async (client) => {
      const { organizationId } = await seed(client)

      const result = await client.query(
        `select * from public.report_expenses($1, null, null, null, null, 'category', 500)`,
        [organizationId],
      )

      const byLabel = Object.fromEntries(result.rows.map((row) => [row.group_label, row]))

      expect(n(byLabel['Electricity'].approved_amount)).toBe(SEED.approvedExpense)
      expect(n(byLabel['Transport'].pending_amount)).toBe(SEED.pendingExpense)
      // Voided rows report under voided_amount and nowhere else, even though
      // this expense was approved before it was withdrawn.
      expect(n(byLabel['Maintenance'].voided_amount)).toBe(SEED.voidedExpense)
      expect(n(byLabel['Maintenance'].approved_amount)).toBe(0)
    })
  })
})

describe('report_refunds', () => {
  it('splits by approval state', async () => {
    await withTransaction(async (client) => {
      const { organizationId } = await seed(client)

      const result = await client.query(
        `select * from public.report_refunds($1, null, null, null, null, 'method', 500)`,
        [organizationId],
      )

      expect(result.rows).toHaveLength(1)
      expect(n(result.rows[0].approved_amount)).toBe(SEED.approvedRefund)
      expect(n(result.rows[0].pending_amount)).toBe(SEED.pendingRefund)
    })
  })
})

describe('report_discounts', () => {
  it('lists only sales that were actually discounted', async () => {
    await withTransaction(async (client) => {
      const { organizationId } = await seed(client)

      const result = await client.query(
        `select * from public.report_discounts($1, null, null, null, null, 'branch', 500)`,
        [organizationId],
      )

      // Only sale 1 carries a discount, so only Branch A appears.
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].group_label).toBe('Branch A')
      expect(n(result.rows[0].discounted_sale_count)).toBe(1)
      expect(n(result.rows[0].total_discount)).toBe(SEED.orderDiscount)
    })
  })
})

describe('inventory reports', () => {
  it('values stock at current cost price', async () => {
    await withTransaction(async (client) => {
      const { organizationId, branchAId } = await seed(client)

      const result = await client.query(
        `select * from public.report_inventory_stock($1, $2, null, false, 500)`,
        [organizationId, branchAId],
      )

      expect(result.rows).toHaveLength(1)
      // 100 seeded, 3 sold, 1 returned
      expect(n(result.rows[0].quantity)).toBe(98)
      expect(n(result.rows[0].valuation)).toBe(98 * SEED.productACost)
    })
  })

  it('returns nothing for low stock when no threshold is set', async () => {
    // A null threshold means "not tracked", not "always low" — the tempting
    // mistake, and the one that would fill the low-stock report with noise.
    await withTransaction(async (client) => {
      const { organizationId } = await seed(client)

      const result = await client.query(
        `select * from public.report_inventory_stock($1, null, null, true, 500)`,
        [organizationId],
      )
      expect(result.rows).toHaveLength(0)
    })
  })

  it('reports low stock once a threshold is set and crossed', async () => {
    await withTransaction(async (client) => {
      const { organizationId, branchAId, productAId } = await seed(client)

      await client.query(
        `update public.inventory_balances set low_stock_threshold = 200
         where branch_id = $1 and product_id = $2`,
        [branchAId, productAId],
      )

      const result = await client.query(
        `select * from public.report_inventory_stock($1, null, null, true, 500)`,
        [organizationId],
      )
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].product_name).toBe('Product A')
    })
  })

  it('lists every movement in the branch with its type and delta', async () => {
    await withTransaction(async (client) => {
      const { organizationId, branchAId } = await seed(client)

      const result = await client.query(
        `select * from public.report_inventory_movements($1, $2, null, null, null, 500)`,
        [organizationId, branchAId],
      )

      // 1 seed adjustment + 2 sale deductions + 1 return
      expect(result.rows).toHaveLength(4)

      const byType = result.rows.reduce<Record<string, number>>((counts, row) => {
        counts[row.movement_type] = (counts[row.movement_type] ?? 0) + 1
        return counts
      }, {})
      expect(byType).toEqual({ ADJUSTMENT: 1, SALE: 2, RETURN: 1 })

      // Deliberately no assertion on ordering. `created_at` defaults to
      // `now()`, which is fixed for a whole transaction, so all four rows here
      // share one timestamp and any order is a valid answer to
      // `order by created_at desc`. Asserting on it would be testing the
      // planner's tie-breaking, not the report.
      const sale = result.rows.find((row) => row.movement_type === 'SALE')
      expect(Number(sale.quantity_delta)).toBeLessThan(0)
    })
  })
})

describe('report_accounting_aggregates reconciles with the pure module', () => {
  it('produces exactly one row of raw sums, and no derived figures', async () => {
    await withTransaction(async (client) => {
      const { organizationId } = await seed(client)

      const result = await client.query(
        `select * from public.report_accounting_aggregates($1, null, null, null, null)`,
        [organizationId],
      )

      expect(result.rows).toHaveLength(1)
      const row = result.rows[0]

      expect(n(row.sale_count)).toBe(EXPECTED.saleCount)
      expect(n(row.gross_sales)).toBe(EXPECTED.grossSales)
      expect(n(row.order_discounts)).toBe(EXPECTED.orderDiscounts)
      expect(n(row.sale_cogs)).toBe(EXPECTED.saleCogs)
      expect(n(row.return_cogs)).toBe(EXPECTED.returnCogs)
      expect(n(row.refunds_approved)).toBe(SEED.approvedRefund)
      expect(n(row.expenses_approved)).toBe(SEED.approvedExpense)

      // The point of the split: SQL sums, TypeScript derives. No column here
      // is a profit figure.
      expect(row).not.toHaveProperty('gross_profit')
      expect(row).not.toHaveProperty('net_profit')
    })
  })

  it('feeds buildAccountingSummary to the hand-computed answer', async () => {
    await withTransaction(async (client) => {
      const { organizationId } = await seed(client)

      const result = await client.query(
        `select * from public.report_accounting_aggregates($1, null, null, null, null)`,
        [organizationId],
      )
      const row = result.rows[0]

      const aggregates: AccountingAggregates = {
        saleCount: n(row.sale_count),
        grossSales: n(row.gross_sales),
        lineDiscounts: n(row.line_discounts),
        orderDiscounts: n(row.order_discounts),
        taxCollected: n(row.tax_collected),
        serviceChargeCollected: n(row.service_charge_collected),
        saleCogs: n(row.sale_cogs),
        returnCogs: n(row.return_cogs),
        refundsApproved: n(row.refunds_approved),
        refundCount: n(row.refund_count),
        expensesApproved: n(row.expenses_approved),
        expenseCount: n(row.expense_count),
      }

      const summary = buildAccountingSummary({ aggregates })

      expect(summary.revenue).toBe(EXPECTED.revenue)
      expect(summary.netSalesAfterRefunds).toBe(EXPECTED.netSalesAfterRefunds)
      expect(summary.cogs).toBe(EXPECTED.cogs)
      expect(summary.grossProfit).toBe(EXPECTED.grossProfit)
      expect(summary.netProfit).toBe(EXPECTED.netProfit)

      // Tax and service charge are collected but are not revenue (§29–30).
      expect(summary.taxPayable).toBe(SEED.tax)
      expect(summary.serviceCharge).toBe(SEED.serviceCharge)
    })
  })

  it('reconciles revenue against the sales report, two independent ways', async () => {
    await withTransaction(async (client) => {
      const { organizationId } = await seed(client)

      const summaryRows = await client.query(
        `select * from public.report_sales_by_scope($1, null, null, null, null, 'branch', 500)`,
        [organizationId],
      )
      const netFromSalesReport = summaryRows.rows.reduce((sum, row) => sum + n(row.net_sales), 0)

      const aggregate = await client.query(
        `select * from public.report_accounting_aggregates($1, null, null, null, null)`,
        [organizationId],
      )
      const row = aggregate.rows[0]
      const netFromAggregates = n(row.gross_sales) - n(row.order_discounts)

      expect(netFromSalesReport).toBe(netFromAggregates)
      expect(netFromSalesReport).toBe(EXPECTED.revenue)
    })
  })

  it('excludes pending refunds and pending or voided expenses', async () => {
    await withTransaction(async (client) => {
      const { organizationId } = await seed(client)

      const result = await client.query(
        `select * from public.report_accounting_aggregates($1, null, null, null, null)`,
        [organizationId],
      )
      const row = result.rows[0]

      expect(n(row.refunds_approved)).toBe(SEED.approvedRefund)
      expect(n(row.refund_count)).toBe(1)
      expect(n(row.expenses_approved)).toBe(SEED.approvedExpense)
      expect(n(row.expense_count)).toBe(1)
    })
  })

  it('scopes to a single branch', async () => {
    await withTransaction(async (client) => {
      const { organizationId, branchBId } = await seed(client)

      const result = await client.query(
        `select * from public.report_accounting_aggregates($1, $2, null, null, null)`,
        [organizationId, branchBId],
      )
      const row = result.rows[0]

      expect(n(row.sale_count)).toBe(1)
      expect(n(row.gross_sales)).toBe(1_200)
      expect(n(row.sale_cogs)).toBe(600)
      // Branch A's expenses must not appear against Branch B.
      expect(n(row.expenses_approved)).toBe(0)
    })
  })
})

describe('run_custom_report agrees with the standard reports', () => {
  it('matches report_sales_by_scope for the same grouping and metric', async () => {
    // Two independently written queries over the same rows. If the custom
    // engine ever disagrees with the standard report, one of them is wrong,
    // and a user comparing two screens would be the one to find out.
    await withTransaction(async (client) => {
      const { organizationId } = await seed(client)

      const standard = await client.query(
        `select * from public.report_sales_by_scope($1, null, null, null, null, 'branch', 500)`,
        [organizationId],
      )
      const custom = await client.query(
        `select * from public.run_custom_report($1, 'sales', 'branch', null, 'net_sales', 'sale_count', null, null, null, null, null, null, 'dimension_1', 'asc', 100)`,
        [organizationId],
      )

      const standardByLabel = Object.fromEntries(
        standard.rows.map((row) => [row.group_label, n(row.net_sales)]),
      )
      const customByLabel = Object.fromEntries(
        custom.rows.map((row) => [row.dimension_1, n(row.metric_1)]),
      )

      expect(customByLabel).toEqual(standardByLabel)
    })
  })

  it('computes gross profit on the sale_items dataset', async () => {
    await withTransaction(async (client) => {
      const { organizationId } = await seed(client)

      const result = await client.query(
        `select * from public.run_custom_report($1, 'sale_items', 'product', null, 'gross_profit', null, null, null, null, null, null, null, 'dimension_1', 'asc', 100)`,
        [organizationId],
      )

      expect(result.rows).toHaveLength(2)
      expect(n(result.rows[0].metric_1)).toBe(600)
      expect(n(result.rows[1].metric_1)).toBe(600)
    })
  })

  it('groups by two dimensions at once', async () => {
    await withTransaction(async (client) => {
      const { organizationId } = await seed(client)

      const result = await client.query(
        `select * from public.run_custom_report($1, 'sales', 'branch', 'day', 'net_sales', null, null, null, null, null, null, null, 'dimension_1', 'asc', 100)`,
        [organizationId],
      )

      expect(result.rows).toHaveLength(2)
      expect(result.rows[0].dimension_2).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  it('honours the row limit', async () => {
    await withTransaction(async (client) => {
      const { organizationId } = await seed(client)

      const result = await client.query(
        `select * from public.run_custom_report($1, 'sales', 'branch', null, 'net_sales', null, null, null, null, null, null, null, 'metric_1', 'desc', 1)`,
        [organizationId],
      )

      expect(result.rows).toHaveLength(1)
      // Highest net sales first: Branch A at 1,400 beats Branch B at 1,200.
      expect(result.rows[0].dimension_1).toBe('Branch A')
    })
  })
})
