-- SELECT-only, mirroring audit_logs/inventory_movements exactly: the sole
-- write path is create_sale() (SECURITY DEFINER, bypasses RLS), combined
-- with never granting INSERT/UPDATE/DELETE on this table to any application
-- role (20260823121700_alter_tables_grant_authenticated_sales.sql) — that's
-- what makes a completed sale append-only at the database level, not just by
-- convention.
create policy sales_select on public.sales
  for select
  using (public.user_has_branch_access(branch_id, organization_id));
