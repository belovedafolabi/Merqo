-- SELECT scoped by branch access, same shape as branches_select. No general
-- INSERT/UPDATE/DELETE policy: `quantity`/`reserved_quantity` only ever
-- change through record_inventory_movement() (SECURITY DEFINER, bypasses
-- RLS entirely), mirroring product_prices' append-only-via-RPC pattern.
--
-- `low_stock_threshold` is the one exception — it isn't part of the
-- movement ledger, so it needs an ordinary authenticated write path. Rather
-- than a second RPC function, this uses a *column-level* GRANT (below,
-- 20260823110800_alter_tables_grant_authenticated_inventory.sql) restricted
-- to `low_stock_threshold` alone: even a caller who bypassed
-- lib/inventory/mutations.ts and called PostgREST directly cannot touch
-- `quantity` through this policy, because Postgres enforces column-level
-- UPDATE privileges independently of RLS's USING/WITH CHECK.
create policy inventory_balances_select on public.inventory_balances
  for select
  using (
    public.user_has_branch_access(
      branch_id,
      (select organization_id from public.branches where id = branch_id)
    )
  );

create policy inventory_balances_update_threshold on public.inventory_balances
  for update
  using (
    public.user_has_branch_access(
      branch_id,
      (select organization_id from public.branches where id = branch_id)
    )
    and public.user_has_permission(
      'inventory.adjust',
      (select organization_id from public.branches where id = branch_id),
      branch_id
    )
  )
  with check (
    public.user_has_branch_access(
      branch_id,
      (select organization_id from public.branches where id = branch_id)
    )
    and public.user_has_permission(
      'inventory.adjust',
      (select organization_id from public.branches where id = branch_id),
      branch_id
    )
  );
