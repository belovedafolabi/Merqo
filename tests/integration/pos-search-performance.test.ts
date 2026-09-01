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

/**
 * Milestone 16 raised this from 5,000-in-one-unit to 25,000 across five
 * business units. Five units matters: searchProducts() always filters
 * `business_unit_id = $1`, so the realistic question is whether that predicate
 * narrows 25,000 rows to 5,000 cheaply before the ilike runs — not whether an
 * ilike over 5,000 rows is fast. §1.2 of the milestone plan gates a
 * sku/barcode trigram migration on the leading-wildcard number this produces:
 * add the index only if that case exceeds 400ms here.
 */
const PRODUCT_COUNT = 25_000
const BUSINESS_UNIT_COUNT = 5
const PRODUCTS_PER_UNIT = PRODUCT_COUNT / BUSINESS_UNIT_COUNT

const KNOWN_BARCODE = 'PERF0000000042'

interface PosPerfFixture {
  /** The unit the search/lookup cases query — holds PRODUCTS_PER_UNIT rows. */
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

  const unitsResult = await client.query<{ id: string }>(
    `insert into public.business_units (branch_id, business_type_id, name, slug)
     select $1, $2, 'Perf Unit ' || u, $3 || '-unit-' || u
     from generate_series(1, $4) as u
     returning id`,
    [branch.rows[0].id, businessType.rows[0].id, suffix, BUSINESS_UNIT_COUNT],
  )
  const unitIds = unitsResult.rows.map((row) => row.id)
  const businessUnitId = unitIds[0]!

  // Names deliberately varied so an ilike is doing real matching rather than
  // hitting every row or none. One in ten is a "Milk" variant, which is what
  // the search cases below query for. Products are spread evenly across all
  // five units; the barcode/sku carry the unit index so they stay unique
  // across the org (products_business_unit_barcode_key is per-unit, but the
  // search cases only touch unitIds[0]).
  for (let u = 0; u < unitIds.length; u += 1) {
    await client.query(
      `insert into public.products (business_unit_id, name, sku, barcode, base_price, cost_price)
       select
         $1,
         case when i % 10 = 0 then 'Milk Carton ' || i else 'Grocery Item ' || i end,
         $2 || '-U' || $4 || '-SKU-' || i,
         'PERF' || $4 || lpad(i::text, 9, '0'),
         100 + i,
         50 + i
       from generate_series(1, $3) as i`,
      [unitIds[u], suffix, PRODUCTS_PER_UNIT, u],
    )
  }

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

  it('the hot reads use an index rather than scanning the catalog', async () => {
    // Deterministic where the timings above are not.
    await withTransaction(async (client) => {
      const { businessUnitId } = await seedCatalog(client)

      // products_business_unit_barcode_key (20260823100100) is what makes a
      // scan O(log n); if a future migration drops or narrows it, this fails
      // on any machine, under any load, instead of only on a slow runner.
      const barcodePlan = await client.query(`explain (format json) ${BARCODE_LOOKUP_SQL}`, [
        businessUnitId,
        KNOWN_BARCODE,
      ])
      const barcodePlanText = JSON.stringify(barcodePlan.rows[0])
      expect(barcodePlanText).toContain('Index')
      expect(barcodePlanText).not.toContain('Seq Scan')

      // searchProducts()'s leading-wildcard ilike cannot use a btree, but the
      // `business_unit_id = $1` predicate still must: it narrows 25,000 rows to
      // one unit's ~5,000 before the ilike runs. A full `Seq Scan on products`
      // here means that narrowing was lost — the regression §1.2 of the
      // Milestone 16 plan is guarding against, and the trigger for adding a
      // sku/barcode trigram index.
      const searchPlan = await client.query(`explain (format json) ${SEARCH_SQL}`, [
        businessUnitId,
        '%ilk%',
      ])
      const searchPlanText = JSON.stringify(searchPlan.rows[0])
      expect(searchPlanText).toContain('Index')
      expect(searchPlanText).not.toContain('Seq Scan on public.products')
      expect(searchPlanText).not.toContain('Seq Scan on products')
    })
  }, 120_000)
})
