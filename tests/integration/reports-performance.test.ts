import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

import { pool, withTransaction } from './helpers/db'

/**
 * Milestone 10's CI/CD requirement: "add a check that report query performance
 * (for the seeded test dataset size) stays within an acceptable threshold, as
 * an early warning before performance becomes a real problem at scale."
 *
 * This is an early-warning tripwire, not a benchmark. The threshold is
 * deliberately generous — a shared CI runner under load is nothing like a
 * production database, and a tight budget here would produce flaky failures
 * that get muted, which is worse than no check at all. What it will actually
 * catch is the class of regression that matters: a dropped index, or a report
 * rewritten into a shape that scans the whole table. Those turn a 50ms query
 * into a multi-second one, not a 900ms one.
 *
 * Rows are inserted directly rather than through create_sale(): this measures
 * the *read* path, and driving 2,000 sales through the write path (with its
 * row-locking inventory deduction) would spend the whole runtime seeding.
 * tests/integration/sales.test.ts already covers that create_sale writes these
 * rows correctly.
 */

/** Generous on purpose — see this file's header. */
const BUDGET_MS = 1_500
const SALE_COUNT = 2_000
const ITEMS_PER_SALE = 4

interface PerfFixture {
  organizationId: string
  branchId: string
  businessUnitId: string
}

async function seedVolume(client: PoolClient): Promise<PerfFixture> {
  const suffix = randomUUID().slice(0, 8)

  const businessType = await client.query(
    `select id from public.business_types where slug = 'supermarket'`,
  )
  const org = await client.query(
    `insert into public.organizations (name, slug) values ('Perf Org', $1) returning id`,
    [`perf-org-${suffix}`],
  )
  const organizationId = org.rows[0].id as string

  const branch = await client.query(
    `insert into public.branches (organization_id, name, slug) values ($1, 'Perf Branch', $2) returning id`,
    [organizationId, `perf-branch-${suffix}`],
  )
  const branchId = branch.rows[0].id as string

  const unit = await client.query(
    `insert into public.business_units (branch_id, business_type_id, name, slug)
     values ($1, $2, 'Perf Unit', $3) returning id`,
    [branchId, businessType.rows[0].id, `perf-unit-${suffix}`],
  )
  const businessUnitId = unit.rows[0].id as string

  // A handful of products, so grouping by product produces real groups rather
  // than 2,000 groups of one.
  await client.query(
    `insert into public.products (business_unit_id, name, sku, base_price, cost_price)
     select $1, 'Perf Product ' || i, $2 || '-' || i, 500 + i, 300 + i
     from generate_series(1, 20) as i`,
    [businessUnitId, `PERF-${suffix}`],
  )

  // Sales spread over a year, so date-range predicates have something to
  // narrow — a report over rows that all share one timestamp would make any
  // index look good.
  await client.query(
    `insert into public.sales
       (organization_id, branch_id, business_unit_id, idempotency_key,
        subtotal, discount_amount, tax_amount, service_charge_amount, total, created_at)
     select
       $1, $2, $3, $4 || '-' || i,
       1000, case when i % 5 = 0 then 100 else 0 end, 75, 0,
       1075 - case when i % 5 = 0 then 100 else 0 end,
       now() - (i || ' minutes')::interval
     from generate_series(1, $5) as i`,
    [organizationId, branchId, businessUnitId, suffix, SALE_COUNT],
  )

  await client.query(
    `insert into public.sale_items
       (sale_id, product_id, quantity, unit_price, line_discount, line_total, unit_cost)
     select s.id, p.id, 2, 250, 0, 500, 150
     from public.sales s
     cross join lateral (
       select id from public.products
       where business_unit_id = $1
       order by id
       limit $2
     ) p
     where s.organization_id = $3`,
    [businessUnitId, ITEMS_PER_SALE, organizationId],
  )

  await client.query(
    `insert into public.payments (sale_id, method, amount)
     select id, 'cash', total from public.sales where organization_id = $1`,
    [organizationId],
  )

  await client.query(
    `insert into public.expenses
       (organization_id, branch_id, business_unit_id, category, amount, payment_method, expense_date, status)
     select $1, $2, $3, 'Category ' || (i % 8), 1000 + i, 'cash', current_date - (i % 300), 'approved'
     from generate_series(1, 500) as i`,
    [organizationId, branchId, businessUnitId],
  )

  // Without this the planner is working from empty-table statistics and will
  // choose a sequential scan regardless of what indexes exist — which would
  // make this suite measure the wrong thing entirely.
  await client.query('analyze public.sales')
  await client.query('analyze public.sale_items')
  await client.query('analyze public.payments')
  await client.query('analyze public.expenses')

  return { organizationId, branchId, businessUnitId }
}

async function timed(client: PoolClient, sql: string, params: unknown[]): Promise<number> {
  const startedAt = performance.now()
  await client.query(sql, params)
  return performance.now() - startedAt
}

afterAll(async () => {
  await pool.end()
})

describe(`report performance against ${SALE_COUNT} sales / ${SALE_COUNT * ITEMS_PER_SALE} line items`, () => {
  it('every standard report and the custom engine stay within budget', async () => {
    await withTransaction(async (client) => {
      const { organizationId, branchId } = await seedVolume(client)

      const from = new Date(Date.now() - 30 * 86_400_000).toISOString()
      const to = new Date(Date.now() + 86_400_000).toISOString()

      const cases: Array<[string, string, unknown[]]> = [
        [
          'sales by day (org-wide)',
          `select * from public.report_sales_by_scope($1, null, null, $2, $3, 'day', 500)`,
          [organizationId, from, to],
        ],
        [
          'sales by day (one branch)',
          `select * from public.report_sales_by_scope($1, $2, null, $3, $4, 'day', 500)`,
          [organizationId, branchId, from, to],
        ],
        [
          'sales by product',
          `select * from public.report_sales_by_item($1, null, null, $2, $3, 'product', 500)`,
          [organizationId, from, to],
        ],
        [
          'sales by payment method',
          `select * from public.report_sales_by_payment_method($1, null, null, $2, $3, 500)`,
          [organizationId, from, to],
        ],
        [
          'accounting aggregates',
          `select * from public.report_accounting_aggregates($1, null, null, $2, $3)`,
          [organizationId, from, to],
        ],
        [
          'discounts',
          `select * from public.report_discounts($1, null, null, $2, $3, 'day', 500)`,
          [organizationId, from, to],
        ],
        [
          'expenses',
          `select * from public.report_expenses($1, null, null, $2, $3, 'category', 500)`,
          [organizationId, from, to],
        ],
        [
          'inventory movements',
          `select * from public.report_inventory_movements($1, $2, null, $3, $4, 500)`,
          [organizationId, branchId, from, to],
        ],
        [
          'custom report, two dimensions',
          `select * from public.run_custom_report($1, 'sales', 'day', 'branch', 'net_sales', 'sale_count', null, null, null, null, $2, $3, 'metric_1', 'desc', 500)`,
          [organizationId, from, to],
        ],
      ]

      const timings: Record<string, number> = {}
      for (const [label, sql, params] of cases) {
        timings[label] = Math.round(await timed(client, sql, params))
      }

      // Logged rather than only asserted: when this does fail on CI, the
      // per-report numbers are what tell you which query regressed.
      console.log('report timings (ms):', timings)

      const overBudget = Object.entries(timings).filter(([, ms]) => ms > BUDGET_MS)
      expect(overBudget).toEqual([])
    })
  }, 120_000)

  it('a grouped report stays far under the 1000-row PostgREST cap', async () => {
    // The reason aggregation happens in SQL at all
    // (supabase/config.toml `max_rows = 1000`). If a grouping ever returned
    // more rows than that, PostgREST would silently truncate the response and
    // the report would be quietly wrong — so the shapes offered must group
    // into far fewer rows than the cap, not merely fewer.
    await withTransaction(async (client) => {
      const { organizationId } = await seedVolume(client)

      const byDay = await client.query(
        `select * from public.report_sales_by_scope($1, null, null, null, null, 'day', 1000)`,
        [organizationId],
      )
      const byProduct = await client.query(
        `select * from public.report_sales_by_item($1, null, null, null, null, 'product', 1000)`,
        [organizationId],
      )

      expect(byDay.rows.length).toBeLessThan(500)
      expect(byProduct.rows.length).toBeLessThan(500)
    })
  }, 120_000)
})
