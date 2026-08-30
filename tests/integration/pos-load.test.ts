import { randomUUID } from 'node:crypto'

import { Pool, type PoolClient } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

import { pool } from './helpers/db'

/**
 * High-concurrency load test for the POS sale path
 * (docs/milestones/15-security-qa-and-hardening.md Testing Requirements:
 * "Load/stress test of the POS concurrency path (Milestone 08) under higher
 * simulated concurrency than earlier milestone-level tests used, to build
 * confidence beyond the minimum case").
 *
 * Milestones 07, 08 and 09 each proved a two-actor lock race: two connections,
 * one contested row, hand-choreographed BEGIN/COMMIT. Those prove
 * correctness at the minimum interesting concurrency. This file asks the
 * different question that only shows up at scale: when fifty tills hit the
 * same balance at once, does the row lock still serialize them into a correct
 * result, and — the part a cashier actually feels — does anyone get a
 * deadlock or serialization error instead of a clean "not enough stock"?
 *
 * DEDICATED POOL, and this is the detail the test's meaning depends on.
 * helpers/db.ts's shared `pool` uses pg's default max of 10 connections. Run
 * against that, fifty "simultaneous" calls would silently queue ten at a time
 * and this suite would be measuring serialization while looking green. The
 * pool below is sized to the concurrency being claimed.
 *
 * Autocommit, no explicit BEGIN/COMMIT: create_sale() is already atomic —
 * it either commits a whole sale or none of it. That is what makes fifty-way
 * feasible here without the hand-choreographed transaction dance the
 * two-actor tests need.
 */

/** Simultaneous callers. */
const CONCURRENT_SALES = 50
/** Units in stock — deliberately fewer than CONCURRENT_SALES. */
const AVAILABLE_STOCK = 30
/** Callers sharing one idempotency key in the second case. */
const CONCURRENT_RETRIES = 20

const UNIT_PRICE = 500

/**
 * Sized to the concurrency under test, plus headroom for the setup and
 * assertion connections that run alongside it.
 */
const loadPool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  max: CONCURRENT_SALES + 2,
})

afterAll(async () => {
  await loadPool.end()
})

async function seedFixture(client: PoolClient, label: string) {
  const suffix = randomUUID().slice(0, 8)
  const businessType = await client.query(
    `select id from public.business_types where slug = 'supermarket'`,
  )
  const org = await client.query(
    `insert into public.organizations (name, slug) values ($1, $2) returning id`,
    [`${label} Org`, `${label.toLowerCase()}-org-${suffix}`],
  )
  const branch = await client.query(
    `insert into public.branches (organization_id, name, slug) values ($1, 'Main', $2) returning id`,
    [org.rows[0].id, `${label.toLowerCase()}-branch-${suffix}`],
  )
  const businessUnit = await client.query(
    `insert into public.business_units (branch_id, business_type_id, name, slug) values ($1, $2, 'BU', $3) returning id`,
    [branch.rows[0].id, businessType.rows[0].id, `${label.toLowerCase()}-bu-${suffix}`],
  )
  const product = await client.query(
    `insert into public.products (business_unit_id, name, sku, base_price, cost_price)
     values ($1, 'Load Test Product', $2, $3, 300) returning id`,
    [businessUnit.rows[0].id, `LOAD-${suffix}`, UNIT_PRICE],
  )

  return {
    organizationId: org.rows[0].id as string,
    branchId: branch.rows[0].id as string,
    businessUnitId: businessUnit.rows[0].id as string,
    productId: product.rows[0].id as string,
  }
}

async function stockUp(client: PoolClient, branchId: string, productId: string, quantity: number) {
  await client.query(
    `select * from public.record_inventory_movement($1, $2, null, 'ADJUSTMENT', $3, 'load-test seed', null, null)`,
    [branchId, productId, quantity],
  )
}

function oneUnitItemsJson(productId: string) {
  return JSON.stringify([
    {
      product_id: productId,
      variant_id: null,
      quantity: 1,
      unit_price: UNIT_PRICE,
      line_discount: 0,
      line_total: UNIT_PRICE,
    },
  ])
}

/** One autocommitted create_sale() on its own dedicated connection. */
async function sellOneUnit(
  fixture: { organizationId: string; branchId: string; businessUnitId: string; productId: string },
  idempotencyKey: string,
): Promise<{ saleId: string }> {
  const client = await loadPool.connect()
  try {
    const result = await client.query<{ id: string }>(
      `select * from public.create_sale($1, $2, $3, $4, $5::jsonb, $6, 0, null, 0, 0, $6, 'cash', $6, null, null)`,
      [
        fixture.organizationId,
        fixture.branchId,
        fixture.businessUnitId,
        idempotencyKey,
        oneUnitItemsJson(fixture.productId),
        UNIT_PRICE,
      ],
    )
    return { saleId: result.rows[0]!.id }
  } finally {
    client.release()
  }
}

async function cleanUp(organizationId: string) {
  // Reverse foreign-key order, same shape as sales.test.ts's own teardown.
  // This suite commits for real, so nothing is rolled back for it.
  await pool.query(
    `delete from public.payments where sale_id in (
       select id from public.sales where organization_id = $1)`,
    [organizationId],
  )
  await pool.query(
    `delete from public.sale_items where sale_id in (
       select id from public.sales where organization_id = $1)`,
    [organizationId],
  )
  await pool.query(`delete from public.sales where organization_id = $1`, [organizationId])
  await pool.query(
    `delete from public.inventory_movements where branch_id in (
       select id from public.branches where organization_id = $1)`,
    [organizationId],
  )
  await pool.query(
    `delete from public.inventory_balances where branch_id in (
       select id from public.branches where organization_id = $1)`,
    [organizationId],
  )
  await pool.query(
    `delete from public.products where business_unit_id in (
       select bu.id from public.business_units bu
       join public.branches b on b.id = bu.branch_id
       where b.organization_id = $1)`,
    [organizationId],
  )
  await pool.query(
    `delete from public.business_units where branch_id in (
       select id from public.branches where organization_id = $1)`,
    [organizationId],
  )
  await pool.query(`delete from public.branches where organization_id = $1`, [organizationId])
  await pool.query(`delete from public.organizations where id = $1`, [organizationId])
}

describe('POS under high concurrency', () => {
  it(`serializes ${CONCURRENT_SALES} simultaneous sales against ${AVAILABLE_STOCK} units without oversell, undersell, or lock errors`, async () => {
    const setup = await loadPool.connect()
    let organizationId = ''

    try {
      const fixture = await seedFixture(setup, 'Load')
      organizationId = fixture.organizationId
      await stockUp(setup, fixture.branchId, fixture.productId, AVAILABLE_STOCK)
      setup.release()

      const startedAt = Date.now()
      const results = await Promise.allSettled(
        Array.from({ length: CONCURRENT_SALES }, () =>
          sellOneUnit(fixture, `load-${randomUUID()}`),
        ),
      )
      const elapsedMs = Date.now() - startedAt

      const fulfilled = results.filter((result) => result.status === 'fulfilled')
      const rejected = results.filter((result) => result.status === 'rejected')

      // No oversell AND no undersell. The undersell half matters as much:
      // a lock that bailed out early rather than waiting would leave stock
      // unsold and look like a passing test if only oversell were asserted.
      expect(fulfilled).toHaveLength(AVAILABLE_STOCK)
      expect(rejected).toHaveLength(CONCURRENT_SALES - AVAILABLE_STOCK)

      // THE assertion this whole file exists for. Every rejection must be the
      // domain's own "not enough stock", never 40P01 (deadlock detected) or
      // 40001 (serialization failure). A cashier can be told an item is out
      // of stock; being shown a database lock error is a defect, and it is
      // the failure mode that only appears once concurrency is high enough
      // for lock ordering to matter.
      for (const result of rejected) {
        const reason = (result as PromiseRejectedResult).reason as {
          code?: string
          message?: string
        }
        expect(reason.code).not.toBe('40P01')
        expect(reason.code).not.toBe('40001')
        expect(reason.message ?? '').toMatch(/stock|insufficient|available/i)
      }

      // Ledger and balance agree — the sale rows, their line quantities and
      // the remaining balance are three independent views of the same truth.
      const balance = await pool.query<{ quantity: string }>(
        `select quantity::text from public.inventory_balances
          where branch_id = $1 and product_id = $2`,
        [fixture.branchId, fixture.productId],
      )
      expect(Number(balance.rows[0]?.quantity)).toBe(0)

      const sales = await pool.query<{ count: string }>(
        `select count(*)::text as count from public.sales where organization_id = $1`,
        [organizationId],
      )
      expect(Number(sales.rows[0]?.count)).toBe(AVAILABLE_STOCK)

      const sold = await pool.query<{ total: string | null }>(
        `select sum(si.quantity)::text as total
           from public.sale_items si
           join public.sales s on s.id = si.sale_id
          where s.organization_id = $1`,
        [organizationId],
      )
      expect(Number(sold.rows[0]?.total)).toBe(AVAILABLE_STOCK)

      // A ceiling, not a benchmark. All fifty callers contend for the same
      // (branch, product) row lock, so the wall clock is roughly fifty times
      // one sale's latency by construction — the number here is loose enough
      // that only a genuine lock pathology (a timeout, a retry storm) trips
      // it, and tight enough that such a pathology cannot pass unnoticed.
      expect(elapsedMs).toBeLessThan(60_000)
    } finally {
      if (organizationId) await cleanUp(organizationId)
    }
  }, 120_000)

  it(`collapses ${CONCURRENT_RETRIES} simultaneous retries of one idempotency key into a single sale`, async () => {
    // Milestone 08 built idempotency and proved it sequentially: call twice,
    // get one sale. This asserts the same guarantee under the condition that
    // actually produces duplicate submissions in the field — a flaky tablet
    // retrying while the first request is still in flight — where a naive
    // check-then-insert would let several callers past the check at once.
    const setup = await loadPool.connect()
    let organizationId = ''

    try {
      const fixture = await seedFixture(setup, 'Idem')
      organizationId = fixture.organizationId
      await stockUp(setup, fixture.branchId, fixture.productId, 100)
      setup.release()

      const sharedKey = `idem-${randomUUID()}`
      const results = await Promise.allSettled(
        Array.from({ length: CONCURRENT_RETRIES }, () => sellOneUnit(fixture, sharedKey)),
      )

      const saleIds = new Set(
        results
          .filter((result) => result.status === 'fulfilled')
          .map((result) => (result as PromiseFulfilledResult<{ saleId: string }>).value.saleId),
      )

      // Every caller that succeeded resolved to the SAME sale.
      expect(saleIds.size).toBe(1)

      const sales = await pool.query<{ count: string }>(
        `select count(*)::text as count from public.sales where organization_id = $1`,
        [organizationId],
      )
      expect(Number(sales.rows[0]?.count)).toBe(1)

      // And exactly one unit left inventory — the customer is charged once
      // and the shelf is decremented once, which is the guarantee that
      // actually matters.
      const balance = await pool.query<{ quantity: string }>(
        `select quantity::text from public.inventory_balances
          where branch_id = $1 and product_id = $2`,
        [fixture.branchId, fixture.productId],
      )
      expect(Number(balance.rows[0]?.quantity)).toBe(99)
    } finally {
      if (organizationId) await cleanUp(organizationId)
    }
  }, 120_000)
})
