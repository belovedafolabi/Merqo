import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

import { pool, withTransaction } from './helpers/db'

/**
 * Milestone 14's performance bar for the POS's two hottest reads — the
 * barcode lookup a scan performs and the search-as-you-type behind the
 * product grid. Its Testing Requirements ask for "a basic benchmark/assertion
 * ... added to CI as a regression guard, not just a one-time manual check",
 * covering the priority interactions docs/PRD.md §42 names.
 *
 * Modeled on tests/integration/reports-performance.test.ts and sharing its
 * stance: an early-warning tripwire, not a benchmark. The budgets are
 * deliberately loose, because a shared CI runner is nothing like a till, and
 * a tight budget produces flake that gets muted — worse than no check.
 *
 * lookupProductByBarcode()/searchProducts() cannot be invoked from a Node
 * test: they build a request-scoped Supabase client and reach next/headers.
 * So this times the SQL shapes they issue, which is exactly the division the
 * reports suite already follows. lib/products/queries.ts is the source those
 * predicates are copied from, and tests/integration/products.test.ts already
 * covers that the functions return the right rows.
 *
 * The EXPLAIN assertion at the end is the more valuable half. Timing catches
 * a regression only if the runner cooperates; a plan assertion catches a
 * dropped index deterministically, and a dropped
 * products(business_unit_id, barcode) index is precisely what would turn a
 * 1ms scan lookup into a full-catalog scan.
 */

/** Generous on purpose — see this file's header. */
const EXACT_LOOKUP_BUDGET_MS = 150
const SEARCH_BUDGET_MS = 1_000

/** A realistic supermarket catalog, and 2.5x the reports fixture's row count. */
const PRODUCT_COUNT = 5_000

const KNOWN_BARCODE = 'PERF0000000042'

interface PosPerfFixture {
  businessUnitId: string
}

async function seedCatalog(client: PoolClient): Promise<PosPerfFixture> {
  const suffix = randomUUID().slice(0, 8)

  const businessType = await client.query(
    `select id from public.business_types where slug = 'supermarket'`,
  )
  const org = await client.query(
    `insert into public.organizations (name, slug) values ('POS Perf Org', $1) returning id`,
    [`pos-perf-org-${suffix}`],
  )
  const branch = await client.query(
    `insert into public.branches (organization_id, name, slug) values ($1, 'Perf Branch', $2) returning id`,
    [org.rows[0].id, `pos-perf-branch-${suffix}`],
  )
  const unit = await client.query(
    `insert into public.business_units (branch_id, business_type_id, name, slug)
     values ($1, $2, 'Perf Unit', $3) returning id`,
    [branch.rows[0].id, businessType.rows[0].id, `pos-perf-unit-${suffix}`],
  )
  const businessUnitId = unit.rows[0].id as string

  // Names deliberately varied so an ilike is doing real matching rather than
  // hitting every row or none. One in ten is a "Milk" variant, which is what
  // the search cases below query for.
  await client.query(
    `insert into public.products (business_unit_id, name, sku, barcode, base_price, cost_price)
     select
       $1,
       case when i % 10 = 0 then 'Milk Carton ' || i else 'Grocery Item ' || i end,
       $2 || '-SKU-' || i,
       'PERF' || lpad(i::text, 10, '0'),
       100 + i,
       50 + i
     from generate_series(1, $3) as i`,
    [businessUnitId, suffix, PRODUCT_COUNT],
  )

  // Without this the planner works from empty-table statistics and picks a
  // sequential scan no matter what indexes exist — which would make this
  // suite measure something other than what it claims to.
  await client.query('analyze public.products')

  return { businessUnitId }
}

async function timed(client: PoolClient, sql: string, params: unknown[]): Promise<number> {
  const startedAt = performance.now()
  await client.query(sql, params)
  return performance.now() - startedAt
}

/** The predicate lib/products/queries.ts's lookupProductByBarcode() issues. */
const BARCODE_LOOKUP_SQL = `
  select id, name, sku, barcode, base_price
  from public.products
  where business_unit_id = $1 and barcode = $2 and archived_at is null
  limit 1`

/** The predicate lib/products/queries.ts's searchProducts() issues. */
const SEARCH_SQL = `
  select id, name, sku, barcode, base_price
  from public.products
  where business_unit_id = $1
    and archived_at is null
    and (name ilike $2 or sku ilike $2 or barcode ilike $2)
  order by name
  limit 50`

afterAll(async () => {
  await pool.end()
})

describe(`POS search/scan performance against a ${PRODUCT_COUNT}-product catalog`, () => {
  it('barcode lookup and product search stay within budget', async () => {
    await withTransaction(async (client) => {
      const { businessUnitId } = await seedCatalog(client)

      const cases: Array<[string, string, unknown[], number]> = [
        [
          'barcode lookup (hit)',
          BARCODE_LOOKUP_SQL,
          [businessUnitId, KNOWN_BARCODE],
          EXACT_LOOKUP_BUDGET_MS,
        ],
        [
          // The scan-miss path is worth its own case: it is the one a
          // mis-scan takes, and a miss cannot short-circuit on a found row.
          'barcode lookup (miss)',
          BARCODE_LOOKUP_SQL,
          [businessUnitId, 'NO-SUCH-BARCODE'],
          EXACT_LOOKUP_BUDGET_MS,
        ],
        ['search, prefix term', SEARCH_SQL, [businessUnitId, 'Milk%'], SEARCH_BUDGET_MS],
        [
          // Leading wildcard: the worst case, and the one searchProducts
          // actually issues, since a cashier types a fragment rather than a
          // prefix. No btree index can serve it — this is the number that
          // would move first if the catalog outgrew a sequential scan.
          'search, leading wildcard',
          SEARCH_SQL,
          [businessUnitId, '%ilk%'],
          SEARCH_BUDGET_MS,
        ],
      ]

      const timings: Record<string, number> = {}
      const overBudget: Array<[string, number, number]> = []
      for (const [label, sql, params, budget] of cases) {
        const ms = Math.round(await timed(client, sql, params))
        timings[label] = ms
        if (ms > budget) overBudget.push([label, ms, budget])
      }

      // Logged, not merely asserted: when this fails on CI, the per-case
      // numbers are what identify which read regressed.
      console.log('POS read timings (ms):', timings)

      expect(overBudget).toEqual([])
    })
  }, 120_000)

  it('the barcode lookup uses an index rather than scanning the catalog', async () => {
    // Deterministic where the timings above are not. products_business_unit_
    // barcode_key (20260823100100) is what makes a scan O(log n); if a future
    // migration drops or narrows it, this fails on any machine, under any
    // load, instead of only on a slow runner.
    await withTransaction(async (client) => {
      const { businessUnitId } = await seedCatalog(client)

      const plan = await client.query(`explain (format json) ${BARCODE_LOOKUP_SQL}`, [
        businessUnitId,
        KNOWN_BARCODE,
      ])
      const planText = JSON.stringify(plan.rows[0])

      expect(planText).toContain('Index')
      expect(planText).not.toContain('Seq Scan')
    })
  }, 120_000)
})
