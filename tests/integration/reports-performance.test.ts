import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { pool } from './helpers/db'

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
 * the *read* path, and driving the sales through the write path (with its
 * row-locking inventory deduction) would spend the whole runtime seeding.
 * tests/integration/sales.test.ts already covers that create_sale writes these
 * rows correctly.
 *
 * Milestone 16 raised SALE_COUNT from 2,000 to 20,000 (its Functional
 * Requirements ask for "a realistic data volume"), added the EXPLAIN guards
 * below (a dropped index is caught deterministically, not just when a slow
 * runner happens to blow the timing budget), and added the storage-footprint
 * measurement that feeds docs/milestones/16-launch/cost-model.md's Supabase
 * free-tier threshold. Because the fixture is now ~20s to build, it is seeded
 * once in beforeAll and every test shares it, inside a transaction rolled back
 * in afterAll — the same cleanup guarantee withTransaction gave per-test, held
 * across the file.
 */

/** Generous on purpose — see this file's header. */
const BUDGET_MS = 1_500
const SALE_COUNT = 20_000
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

  // Sales spread over ~14 months (30 minutes apart), so a 30-day report window
  // is genuinely selective — it captures roughly 7% of the rows. This matters
  // for the EXPLAIN guards below: when a window covers 100% of a single org's
  // sales, a Seq Scan is the *correct* plan and an index check would be
  // asserting the wrong thing.
  await client.query(
    `insert into public.sales
       (organization_id, branch_id, business_unit_id, idempotency_key,
        subtotal, discount_amount, tax_amount, service_charge_amount, total, created_at)
     select
       $1, $2, $3, $4 || '-' || i,
       1000, case when i % 5 = 0 then 100 else 0 end, 75, 0,
       1075 - case when i % 5 = 0 then 100 else 0 end,
       now() - ((i * 30) || ' minutes')::interval
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

  // report_inventory_movements has an EXPLAIN guard and a timing case, so this
  // branch needs a ledger at a volume that matches the sales — a real sale of
  // ITEMS_PER_SALE lines writes that many SALE movements, so this mirrors
  // sale_items row-for-row, plus the created_at spread the guard needs to make
  // the date predicate selective.
  await client.query(
    `insert into public.inventory_movements
       (branch_id, business_unit_id, product_id, variant_id, movement_type,
        quantity_delta, quantity_after, reason, created_at)
     select $1, $2, p.id, null, 'SALE', -2, 100, 'reports-perf seed', s.created_at
     from public.sales s
     cross join lateral (
       select id from public.products
       where business_unit_id = $2
       order by id
       limit $3
     ) p
     where s.organization_id = $4`,
    [branchId, businessUnitId, ITEMS_PER_SALE, organizationId],
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
  await client.query('analyze public.inventory_movements')

  return { organizationId, branchId, businessUnitId }
}

async function timed(client: PoolClient, sql: string, params: unknown[]): Promise<number> {
  const startedAt = performance.now()
  await client.query(sql, params)
  return performance.now() - startedAt
}

let client: PoolClient
let fixture: PerfFixture

beforeAll(async () => {
  client = await pool.connect()
  await client.query('BEGIN')
  fixture = await seedVolume(client)
}, 120_000)

afterAll(async () => {
  if (client) {
    await client.query('ROLLBACK')
    client.release()
  }
  await pool.end()
})

describe(`report performance against ${SALE_COUNT} sales / ${SALE_COUNT * ITEMS_PER_SALE} line items`, () => {
  it('every standard report and the custom engine stay within budget', async () => {
    {
      const { organizationId, branchId } = fixture

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
    }
  }, 120_000)

  it('the highest-volume report predicates use an index rather than scanning', async () => {
    // Deterministic where the timings above are not. You cannot EXPLAIN a
    // plpgsql function body (`explain select * from report_x(...)` yields only
    // "Function Scan"), so each predicate is copied inline from its source
    // migration with a line reference — the same division
    // tests/integration/pos-search-performance.test.ts already uses. A drift
    // between the copy and the function is visible in review; a dropped index
    // fails this test on any machine.
    const { organizationId, branchId } = fixture
    const from = new Date(Date.now() - 30 * 86_400_000).toISOString()
    const to = new Date(Date.now() + 86_400_000).toISOString()

    // 20260823141000_create_report_functions.sql — report_sales_by_scope, the
    // date-bucketed sales aggregate. Served by sales_organization_created_at_idx
    // (20260823140800).
    const salesByScope = `
      select date_trunc('day', s.created_at) bucket, count(*), sum(s.total)
      from public.sales s
      where s.organization_id = $1
        and s.created_at >= $2 and s.created_at < $3
      group by 1`

    // report_sales_by_item — the same date/org narrowing, then a join to
    // sale_items. sale_items_sale_id_idx carries the join.
    const salesByItem = `
      select si.product_id, sum(si.quantity), sum(si.line_total)
      from public.sales s
      join public.sale_items si on si.sale_id = s.id
      where s.organization_id = $1
        and s.created_at >= $2 and s.created_at < $3
      group by si.product_id`

    // report_sales_by_payment_method AFTER the Milestone 16 re-date
    // (20260830090100): the range predicate moves from payments.created_at
    // (unindexed) to sales.created_at, so sales_organization_created_at_idx
    // drives it and payments is reached only by sale_id.
    const salesByPayment = `
      select pay.method, count(*), sum(pay.amount)
      from public.payments pay
      join public.sales s on s.id = pay.sale_id
      where s.organization_id = $1
        and s.created_at >= $2 and s.created_at < $3
      group by pay.method`

    // report_inventory_movements — branch + date scoped. Served by
    // inventory_movements_branch_created_at_idx (20260823140900).
    const inventoryMovements = `
      select im.movement_type, count(*), sum(im.quantity_delta)
      from public.inventory_movements im
      where im.branch_id = $1
        and im.created_at >= $2 and im.created_at < $3
      group by im.movement_type`

    const guards: Array<[string, string, unknown[]]> = [
      ['sales by scope', salesByScope, [organizationId, from, to]],
      ['sales by item', salesByItem, [organizationId, from, to]],
      ['sales by payment method', salesByPayment, [organizationId, from, to]],
      ['inventory movements', inventoryMovements, [branchId, from, to]],
    ]

    const scanning: string[] = []
    for (const [label, sql, params] of guards) {
      const plan = await client.query(`explain (format json) ${sql}`, params)
      const planText = JSON.stringify(plan.rows[0])
      // A Seq Scan on the big transactional tables is the regression. A Seq
      // Scan on a tiny lookup (business_types, a single-row subquery) is not,
      // so match the table name.
      if (
        /Seq Scan.{0,40}"?(sales|sale_items|payments|inventory_movements)"?/.test(planText) ||
        !planText.includes('Index')
      ) {
        scanning.push(`${label}: ${planText}`)
      }
    }

    expect(scanning).toEqual([])
  }, 60_000)

  it('a grouped report stays far under the 1000-row PostgREST cap', async () => {
    // The reason aggregation happens in SQL at all
    // (supabase/config.toml `max_rows = 1000`). If a grouping ever returned
    // more rows than that, PostgREST would silently truncate the response and
    // the report would be quietly wrong — so the shapes offered must group
    // into far fewer rows than the cap, not merely fewer.
    const { organizationId } = fixture

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
  }, 60_000)

  it('per-sale storage footprint stays within the model cost-model.md assumes', async () => {
    // The input to docs/milestones/16-launch/cost-model.md's Supabase
    // free-tier (500 MB) threshold row. Measured, not guessed: total on-disk
    // bytes (heap + indexes + toast) for the four tables a sale writes,
    // divided by the seeded sale count. Logged for the doc; asserted only
    // loosely, as a tripwire against a new index or column silently doubling
    // the per-sale cost.
    const { rows } = await client.query<{ table_name: string; bytes: string }>(
      `select relname as table_name, pg_total_relation_size(oid) as bytes
       from pg_class
       where relname in ('sales', 'sale_items', 'payments', 'inventory_movements')
         and relkind = 'r'`,
    )
    const totalBytes = rows.reduce((sum, r) => sum + Number(r.bytes), 0)
    const bytesPerSale = Math.round(totalBytes / SALE_COUNT)

    console.log('storage footprint:', {
      perTable: Object.fromEntries(rows.map((r) => [r.table_name, Number(r.bytes)])),
      totalBytes,
      bytesPerSale,
      // Rows from the whole local DB, not just this fixture, so this is an
      // upper bound — every other test's leftovers inflate it. The doc records
      // the fixture-only figure derived from a fresh `db reset`.
    })

    // ~5 KB/sale would already be generous for four narrow rows plus indexes;
    // 20 KB means something structural changed.
    expect(bytesPerSale).toBeLessThan(20_000)
  }, 30_000)
})
