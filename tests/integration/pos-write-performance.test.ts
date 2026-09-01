import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { pool } from './helpers/db'

/**
 * Milestone 16's performance review, write half.
 *
 * tests/integration/reports-performance.test.ts and
 * tests/integration/pos-search-performance.test.ts both measure *reads*.
 * tests/integration/pos-load.test.ts proves create_sale() is correct under
 * fifty-way concurrency, but never times it. Nothing anywhere measured what a
 * single checkout costs against a catalog and a sales history of realistic
 * size — and that is the one path with a hard external ceiling on it:
 * Vercel's serverless function duration limit (10s on Hobby, 60s on Pro). The
 * 30-line number this suite prints is the input to that threshold row in
 * docs/milestones/16-launch/cost-model.md.
 *
 * Same stance as its two sibling suites: an early-warning tripwire, not a
 * benchmark. Budgets are deliberately loose, because a shared CI runner is
 * nothing like a till, and a tight budget produces flake that gets muted —
 * worse than no check. The EXPLAIN assertions at the end are the deterministic
 * half; they fail on any machine, under any load, if an index is dropped.
 *
 * History rows are inserted directly rather than driven through create_sale():
 * this measures the cost of *one* sale against existing volume, and driving
 * 20,000 sales through the write path would spend the entire runtime seeding.
 * tests/integration/sales.test.ts already covers that create_sale() writes
 * these rows correctly.
 */

/** Generous on purpose — see this file's header. */
const ONE_LINE_BUDGET_MS = 250
const TEN_LINE_BUDGET_MS = 1_000
/** A full supermarket basket, and the number cost-model.md quotes. */
const THIRTY_LINE_BUDGET_MS = 2_500

const PRODUCT_COUNT = 25_000
const HISTORICAL_SALES = 20_000
const ITEMS_PER_HISTORICAL_SALE = 4
/** 4 x 25,000 products = 100,000 movement rows. */
const MOVEMENTS_PER_PRODUCT = 4

const UNIT_PRICE = 500
/** Stock per product, comfortably above anything a single case sells. */
const STOCK_PER_PRODUCT = 500

interface WritePerfFixture {
  organizationId: string
  branchId: string
  businessUnitId: string
  productIds: string[]
}

async function seedVolume(client: PoolClient): Promise<WritePerfFixture> {
  const suffix = randomUUID().slice(0, 8)

  const businessType = await client.query(
    `select id from public.business_types where slug = 'supermarket'`,
  )
  const org = await client.query(
    `insert into public.organizations (name, slug) values ('Write Perf Org', $1) returning id`,
    [`write-perf-org-${suffix}`],
  )
  const organizationId = org.rows[0].id as string

  const branch = await client.query(
    `insert into public.branches (organization_id, name, slug) values ($1, 'Perf Branch', $2) returning id`,
    [organizationId, `write-perf-branch-${suffix}`],
  )
  const branchId = branch.rows[0].id as string

  const unit = await client.query(
    `insert into public.business_units (branch_id, business_type_id, name, slug)
     values ($1, $2, 'Perf Unit', $3) returning id`,
    [branchId, businessType.rows[0].id, `write-perf-unit-${suffix}`],
  )
  const businessUnitId = unit.rows[0].id as string

  await client.query(
    `insert into public.products (business_unit_id, name, sku, barcode, base_price, cost_price)
     select $1, 'Write Perf Product ' || i, $2 || '-SKU-' || i, $2 || lpad(i::text, 10, '0'), $3, 300
     from generate_series(1, $4) as i`,
    [businessUnitId, suffix, UNIT_PRICE, PRODUCT_COUNT],
  )

  // Balances inserted directly rather than through record_inventory_movement():
  // 25,000 round trips through that function would dominate the runtime, and
  // what is being measured is the cost of locking one of 25,000 existing
  // balance rows, not the cost of creating them.
  await client.query(
    `insert into public.inventory_balances (branch_id, business_unit_id, product_id, variant_id, quantity)
     select $1, $2, id, null, $3 from public.products where business_unit_id = $2`,
    [branchId, businessUnitId, STOCK_PER_PRODUCT],
  )

  // Sales spread over a year so the reporting indexes on (organization_id,
  // created_at) hold realistically distributed keys rather than one timestamp.
  await client.query(
    `insert into public.sales
       (organization_id, branch_id, business_unit_id, idempotency_key,
        subtotal, discount_amount, tax_amount, service_charge_amount, total, created_at)
     select
       $1, $2, $3, $4 || '-hist-' || i,
       1000, 0, 75, 0, 1075,
       now() - ((i % 525600) || ' minutes')::interval
     from generate_series(1, $5) as i`,
    [organizationId, branchId, businessUnitId, suffix, HISTORICAL_SALES],
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
    [businessUnitId, ITEMS_PER_HISTORICAL_SALE, organizationId],
  )

  await client.query(
    `insert into public.payments (sale_id, method, amount)
     select id, 'cash', total from public.sales where organization_id = $1`,
    [organizationId],
  )

  // The ledger create_sale() appends to on every line item. Its size is what
  // makes the insert side of a checkout non-free. MOVEMENTS_PER_PRODUCT rows
  // per product, via a plain cross join — a lateral offset/limit per row would
  // turn this seed quadratic.
  await client.query(
    `insert into public.inventory_movements
       (branch_id, business_unit_id, product_id, variant_id, movement_type,
        quantity_delta, quantity_after, reason)
     select $1, $2, p.id, null, 'ADJUSTMENT', 1, $3, 'write-perf seed'
     from generate_series(1, $4) as g
     cross join public.products p
     where p.business_unit_id = $2`,
    [branchId, businessUnitId, STOCK_PER_PRODUCT, MOVEMENTS_PER_PRODUCT],
  )

  const products = await client.query<{ id: string }>(
    `select id from public.products where business_unit_id = $1 order by id limit 30`,
    [businessUnitId],
  )

  // Without this the planner works from empty-table statistics and picks a
  // sequential scan no matter what indexes exist — which would make this suite
  // measure something other than what it claims to.
  for (const table of [
    'products',
    'inventory_balances',
    'inventory_movements',
    'sales',
    'sale_items',
    'payments',
  ]) {
    await client.query(`analyze public.${table}`)
  }

  return {
    organizationId,
    branchId,
    businessUnitId,
    productIds: products.rows.map((row) => row.id),
  }
}

/** The cart shape create_sale() takes, matching tests/integration/pos-load.test.ts. */
function itemsJson(productIds: string[]): string {
  return JSON.stringify(
    productIds.map((productId) => ({
      product_id: productId,
      variant_id: null,
      quantity: 1,
      unit_price: UNIT_PRICE,
      line_discount: 0,
      line_total: UNIT_PRICE,
    })),
  )
}

async function timedSale(
  client: PoolClient,
  fixture: WritePerfFixture,
  lineCount: number,
): Promise<number> {
  const items = itemsJson(fixture.productIds.slice(0, lineCount))
  const total = UNIT_PRICE * lineCount
  const startedAt = performance.now()
  await client.query(
    `select * from public.create_sale($1, $2, $3, $4, $5::jsonb, $6, 0, null, 0, 0, $6, 'cash', $6, null, null)`,
    [
      fixture.organizationId,
      fixture.branchId,
      fixture.businessUnitId,
      `write-perf-${randomUUID()}`,
      items,
      total,
    ],
  )
  return performance.now() - startedAt
}

/**
 * One client, one transaction, seeded once. The two sibling read suites re-seed
 * inside every `it` because their fixtures are cheap (2–5k rows); this one's is
 * ~230k rows and ~35s, so it is seeded once in beforeAll and both tests share
 * it. The open transaction is rolled back in afterAll, so nothing is left
 * behind — the same cleanup guarantee `withTransaction` gives, held across the
 * whole file instead of one test.
 */
let client: PoolClient
let fixture: WritePerfFixture

beforeAll(async () => {
  client = await pool.connect()
  await client.query('BEGIN')
  fixture = await seedVolume(client)
}, 300_000)

afterAll(async () => {
  if (client) {
    await client.query('ROLLBACK')
    client.release()
  }
  await pool.end()
})

describe(`POS write performance against ${PRODUCT_COUNT} products / ${HISTORICAL_SALES} sales`, () => {
  it('create_sale stays within budget for 1-, 10- and 30-line carts', async () => {
    const cases: Array<[string, number, number]> = [
      ['1-line cart', 1, ONE_LINE_BUDGET_MS],
      ['10-line cart', 10, TEN_LINE_BUDGET_MS],
      ['30-line cart (full basket)', 30, THIRTY_LINE_BUDGET_MS],
    ]

    const timings: Record<string, number> = {}
    const overBudget: Array<[string, number, number]> = []
    for (const [label, lineCount, budget] of cases) {
      const ms = Math.round(await timedSale(client, fixture, lineCount))
      timings[label] = ms
      if (ms > budget) overBudget.push([label, ms, budget])
    }

    // Logged, not merely asserted: the 30-line number is what
    // docs/milestones/16-launch/cost-model.md quotes against Vercel's
    // function duration limit, and it has to come from somewhere real.
    console.log('create_sale timings (ms):', timings)

    expect(overBudget).toEqual([])
  }, 120_000)

  it('the inventory balance lock and the idempotency re-read both use an index', async () => {
    // Deterministic where the timings above are not. These are the two lookups
    // every single checkout performs, and both would degrade silently into a
    // scan if a future migration narrowed the index behind them.

    // The predicate 20260823110400_create_inventory_functions.sql:62-67
    // issues under `for update` — the row-level lock that is the entire
    // concurrency guarantee. `is not distinct from` cannot be an index
    // condition, so (branch_id, product_id) must carry the lookup.
    const lockPlan = await client.query(
      `explain (format json)
       select quantity from public.inventory_balances
       where branch_id = $1 and product_id = $2 and variant_id is not distinct from null
       for update`,
      [fixture.branchId, fixture.productIds[0]],
    )
    const lockPlanText = JSON.stringify(lockPlan.rows[0])

    expect(lockPlanText).toContain('Index')
    expect(lockPlanText).not.toContain('Seq Scan')

    // The re-read create_sale() performs when a till retries a checkout.
    // A scan here would make every retry cost a full table read.
    const idempotencyPlan = await client.query(
      `explain (format json)
       select id from public.sales where idempotency_key = $1`,
      ['write-perf-no-such-key'],
    )
    const idempotencyPlanText = JSON.stringify(idempotencyPlan.rows[0])

    expect(idempotencyPlanText).toContain('Index')
    expect(idempotencyPlanText).not.toContain('Seq Scan')
  }, 30_000)
})
