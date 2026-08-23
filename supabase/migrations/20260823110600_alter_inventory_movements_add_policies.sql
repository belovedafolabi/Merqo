-- SELECT-only, mirroring audit_logs/product_prices exactly: the sole insert
-- path is record_inventory_movement() (SECURITY DEFINER, bypasses RLS),
-- combined with never granting INSERT/UPDATE/DELETE on this table to any
-- application role — that's what makes it append-only at the database
-- level, not just by convention.
create policy inventory_movements_select on public.inventory_movements
  for select
  using (
    public.user_has_branch_access(
      branch_id,
      (select organization_id from public.branches where id = branch_id)
    )
  );
