-- Cost snapshot at time of sale — the symmetric completion of a decision
-- Milestone 08 already made for the *selling* price.
--
-- 20260823100100_create_sale_items.sql captured `unit_price` precisely so a
-- later price edit could never rewrite what a past sale charged ("immune to
-- later product price changes"). It did not capture cost, because nothing
-- read cost yet. Milestone 10 is the first consumer: COGS = Σ(quantity ×
-- cost), and gross profit = revenue − COGS.
--
-- Without this column, COGS would have to join live `products.cost_price` /
-- `product_variants.cost_price` — both freely mutable. Editing a product's
-- cost today would then silently rewrite *last month's* gross profit, which
-- fails Milestone 10's acceptance criterion that "accounting calculations
-- reconcile correctly against the underlying transactional data". A report
-- that changes its answer for a closed period is not reconcilable with
-- anything. Snapshotting is the same fix, for the same reason, as unit_price.
--
-- Note what this deliberately is NOT: weighted-average costing
-- (docs/Financial_Architecture_Accounting_Reconciliation.md §11–12). That
-- needs a running average maintained across every receipt of stock, which no
-- table here supports (`inventory_movements` has no cost column at all).
-- Snapshot-at-sale is the honest intermediate-accounting MVP this milestone
-- scopes; weighted average is tracked as a follow-up, not faked here.
--
-- `default 0` rather than a nullable column: COGS is a sum, and a null
-- propagating through `sum()` would silently drop a line from the total
-- rather than fail loudly. Zero is also the correct value for a product whose
-- cost was genuinely never recorded — `products.cost_price` itself defaults
-- to 0 (20260823100100_create_products.sql), so this matches the source.
alter table public.sale_items
  add column unit_cost numeric(14, 2) not null default 0 check (unit_cost >= 0);

-- One-time backfill for rows written before this migration. Resolution order
-- mirrors lib/inventory/queries.ts's established
-- `variant.cost_price ?? product.cost_price ?? 0` rule — a variant may carry
-- its own cost (nullable, per 20260823100200_create_product_variants.sql) and
-- falls back to its parent product when it does not.
--
-- This backfill is an acknowledged approximation: it applies *today's* cost
-- to *historical* sales, which is exactly the drift the column exists to
-- prevent. It is nonetheless exact in practice — Milestones 11–16 are still
-- outstanding, so no production deployment exists and every affected row is
-- local seed/test data whose cost has never been edited. Any future cost
-- correction to already-sold history must be a deliberate, audited
-- adjustment, never another blanket update like this one.
-- Written as two correlated scalar subqueries rather than `UPDATE ... FROM
-- products LEFT JOIN product_variants ON pv.id = si.variant_id`: Postgres
-- does not allow the UPDATE target to be referenced from inside a FROM-clause
-- join condition, so that shape fails to plan. The coalesce chain expresses
-- the same fallback directly and reads closer to the rule it implements.
update public.sale_items si
set unit_cost = coalesce(
  (select pv.cost_price from public.product_variants pv where pv.id = si.variant_id),
  (select p.cost_price from public.products p where p.id = si.product_id),
  0
);
