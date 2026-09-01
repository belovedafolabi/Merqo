# Performance & Index Review

Milestone 16's Functional Requirements ask that the highest-traffic queries
"perform acceptably against a realistic data volume, verified with actual query
analysis, not assumption", and that any optimization be "evidence-based: use
`EXPLAIN ANALYZE` ... to identify real bottlenecks rather than optimizing
speculatively."

Every number below comes from the local Supabase Postgres (v17.6) against
fixtures the CI integration suite now seeds on every run. The suites are
`tests/integration/pos-write-performance.test.ts` (new),
`pos-search-performance.test.ts`, and `reports-performance.test.ts`. Each
pairs a deliberately loose timing budget with a deterministic `EXPLAIN` plan
assertion — the timing catches a regression only if the CI runner cooperates;
the plan assertion catches a dropped index on any machine.

## The four named highest-traffic paths

| Path | Fixture volume | Measured | Plan | Verdict |
|------|----------------|----------|------|---------|
| Barcode lookup (`lib/products/queries.ts` `lookupProductByBarcode`) | 25,000 products / 5 business units | 2–3 ms | Index scan on `products_business_unit_barcode_key` | No change. Already correct, now guarded at 5× the old volume. |
| Product search (`searchProducts`, leading-wildcard `%term%`) | 25,000 products / 5 business units | 21 ms | `Bitmap Index Scan on products_business_unit_id_idx` (5,000 rows) → `Bitmap Heap Scan` with the `ilike` as a filter | **No index added.** See below. |
| Sale creation (`create_sale`, 30-line basket) | 25k products, 20k sales, 25k balances, 100k movements | 22 ms (1-line: 11 ms, 10-line: 13 ms) | Balance lock uses `inventory_balances_branch_id_product_id_variant_id_key`; idempotency re-read uses `sales_idempotency_key_key` | No change. ~450× margin under Vercel's 10 s function limit. |
| Standard reports (9 RPCs) | 20,000 sales / 80,000 line items / 80,000 movements | 4–102 ms, all against a 1,500 ms budget | see per-report EXPLAIN guards below | One function changed (payment-method report), no indexes added. |

## Product search — index declined, with the number

The search predicate is `business_unit_id = $1 AND archived_at IS NULL AND
(name ILIKE $2 OR sku ILIKE $2 OR barcode ILIKE $2)`, and the query a cashier
actually issues uses a *leading* wildcard (`%milk%`), which no B-tree can
serve. Only `name` has a trigram index (`products_name_trgm_idx`).

The decision rule set in planning: add `products_sku_trgm_idx` /
`products_barcode_trgm_idx` **only if** the leading-wildcard case exceeds
**400 ms at 25,000 rows**.

Measured: **21 ms**. The `business_unit_id = $1` predicate narrows 25,000
rows to one unit's ~5,000 via `products_business_unit_id_idx` before the
`ILIKE` filter runs — a bitmap index scan, not a full table scan:

```
Limit
  ->  Sort  (Sort Key: products.name)
        ->  Bitmap Heap Scan on products  (actual rows=500)
              Filter: ((archived_at IS NULL) AND ((name ~~* '%ilk%') OR (sku ~~* '%ilk%') OR (barcode ~~* '%ilk%')))
              Rows Removed by Filter: 4500
              ->  Bitmap Index Scan on products_business_unit_id_idx  (actual rows=5000)
```

**Two trigram GIN indexes were not added.** They would add write
amplification to every product create/edit to speed up a path that is already
20× under budget. `pos-search-performance.test.ts` now asserts this plan
shape (`Index` present, no `Seq Scan on products`); if a future catalog
outgrows the per-unit bitmap scan, that guard fails and this decision gets
revisited with a fresh number.

## `report_sales_by_payment_method` — the one function changed

Migration: `supabase/migrations/20260830090100_alter_report_sales_by_payment_method_date_on_sale.sql`

This report ranged its date predicate on `payments.created_at`. `payments`
carries exactly one index — `payments_sale_id_idx` (`20260823120200`) — so
that range had nothing to use, and the `sales` half of the join had no date
predicate, so `sales_organization_created_at_idx` (`20260823140800`) could not
narrow it either. Structurally the same defect `20260823140800` fixed for
`sales`, in the one report Milestone 10's index pass missed.

EXPLAIN at 20,000 sales, 30-day window (payment timestamps spread to match
the sales):

```
OLD  (range on pay.created_at)
  ->  Seq Scan on sales s       (actual rows=20000)
  ->  Seq Scan on payments pay  (actual rows=1440, Rows Removed by Filter: 18560)
  Execution Time: 11.7 ms

NEW  (range on s.created_at, shipped)
  ->  Bitmap Index Scan on sales_organization_created_at_idx  (actual rows=1440)
  ->  Seq Scan on payments pay  (hash-join build side)
  Execution Time: 5.3 ms
```

At 20k sales the absolute difference is small; the point is the *scaling*. OLD
reads every sale and every payment the organization has ever recorded — O(all
history). NEW reads only the sales in the window via the index — O(window).

Same totals: every `payments` row is written inside `create_sale()`
(`20260823140700`) in the same transaction as its sale, so
`payments.created_at` and `sales.created_at` differ by microseconds, and every
other report in `20260823141000` already dates off the parent sale.

**Considered and rejected:** adding `payments_created_at_idx`. It would add
write amplification to the second-hottest insert path (a payments row per
sale) to preserve a payment-time-vs-sale-time distinction that does not exist
while Milestone 08 excludes split payments.

## Reports — EXPLAIN guards added, no indexes

`reports-performance.test.ts` now asserts the four highest-volume report
predicates (`report_sales_by_scope`, `report_sales_by_item`,
`report_sales_by_payment_method`, `report_inventory_movements`) each use an
index and do not `Seq Scan` the big transactional tables. All pass:
`sales_organization_created_at_idx` and
`inventory_movements_branch_created_at_idx` (`20260823140900`) carry them.

Per-report timings at 20k sales / 80k line items / 80k movements:

| Report | ms |
|--------|----|
| sales by day (org-wide) | 9 |
| sales by day (one branch) | 6 |
| sales by product | 34 |
| sales by payment method | 20 |
| accounting aggregates | 23 |
| discounts | 19 |
| expenses | 4 |
| inventory movements | 102 |
| custom report, two dimensions | 17 |

## Measure-first candidates — not indexed

- **`refunds` / `returns` `(organization_id, created_at)`** — same defect
  shape as sales, but refunds/returns are exceptional events, one to two
  orders of magnitude lower volume. `report_discounts` (19 ms) and
  `report_expenses` (4 ms) share the shape and pass comfortably. Decision
  rule for a future revisit: add only if `report_refunds` /
  `report_accounting_aggregates` exceed 750 ms at this fixture volume.
- **`audit_logs`** — grows on every mutation, has single-column
  `organization_id` and `created_at` indexes. Confirmed there is **no read
  path** anywhere in `lib/` or `app/` (`grep` for `from('audit_logs')` is
  empty): the table is write-only. No index work.

## Frontend / Next.js build

The one heavy dependency, `exceljs`, is already dynamically imported inside
the function that uses it (`lib/reports/export/xlsx.ts:62`, with a header
comment saying exactly that). No route imports it eagerly.

The `next build` route-size table could not be captured in the milestone's
build environment — `next/font/google` fetches Inter from
`fonts.googleapis.com` at build time and the environment is offline; the
`quality` CI job's `pnpm build` step (which has network) is the place that
table is produced. The substantive conclusion does not depend on it: no
frontend refactor is warranted, because the only code-splitting opportunity
in the codebase is already taken.

## Storage footprint (feeds `cost-model.md`)

`reports-performance.test.ts` measures `pg_total_relation_size` for the four
tables a sale writes. At 20,000 seeded sales, on a shared local DB (an upper
bound — other suites' committed rows inflate it):

| Table | bytes |
|-------|-------|
| inventory_movements | 43,597,824 |
| sale_items | 25,706,496 |
| sales | 16,932,864 |
| payments | 6,447,104 |
| **per seeded sale** | **~4.2 KB** (heap + indexes + toast) |

See `cost-model.md` for what this implies against Supabase Free's 500 MB.
