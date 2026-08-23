-- One index, added against a named query rather than guessed at — Milestone
-- 10's Database Changes are explicit that report indexes are "identified
-- during implementation via query analysis, not guessed".
--
-- The query: every organization-wide financial report
-- (report_sales_summary, report_gross_profit, report_accounting_summary in
-- 20260823141000, all called with p_branch_id null) filters
-- `organization_id = $1 and created_at >= $2 and created_at < $3`.
--
-- Why the existing indexes don't serve it:
--   * `sales_organization_id_idx (organization_id)` is single-column, so the
--     date range degenerates into a post-scan filter over every sale the
--     organization has ever made. The scope equality is the *unselective*
--     half of a reporting predicate — one org owns all its own rows — so this
--     index effectively reads the whole table for a one-day report.
--   * `sales_branch_id_idx (branch_id, created_at desc)` has the right shape
--     but the wrong leading column; it cannot serve a query with no branch
--     equality.
--
-- The single-column organization index is dropped rather than kept alongside:
-- it is now an exact prefix of the new composite, so Postgres can satisfy
-- anything it served from the new index, and keeping both would add write
-- cost on `sales` (the hottest insert path in the product) for no read
-- benefit at all.
create index sales_organization_created_at_idx
  on public.sales (organization_id, created_at desc);

drop index if exists public.sales_organization_id_idx;
