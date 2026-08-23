-- Deliberately SELECT-only, mirroring audit_logs' append-only pattern
-- exactly (20260822094900_alter_audit_logs_add_policies.sql /
-- 20260822093500_create_audit_functions.sql): no INSERT/UPDATE/DELETE
-- policy is authored here, and none should ever be added. Writes go
-- exclusively through record_product_price() below, which runs as the
-- table owner and bypasses RLS — the only way into this table. Combined
-- with never granting table-level INSERT/UPDATE/DELETE on product_prices to
-- any application role, this makes it append-only at the database level —
-- the safeguard this milestone's own Risks section calls for ("a later
-- price change silently rewriting historical sale totals").
create policy product_prices_select on public.product_prices
  for select
  using (
    public.user_has_business_unit_access(
      (select business_unit_id from public.products where id = product_id),
      (
        select bu.branch_id
        from public.products p
        join public.business_units bu on bu.id = p.business_unit_id
        where p.id = product_id
      )
    )
  );

-- The shared write path lib/products/mutations.ts's updateBasePrice() and
-- upsertBranchPriceOverride() call after writing the live
-- products.base_price / branch_price_overrides.price column, in the same
-- request. Permission is already enforced by requirePermission() at the
-- Server Action layer and by products_update/branch_price_overrides_update's
-- own RLS on the live-column write that precedes this call — this function
-- only needs to exist as the sole insert path, not re-check authorization
-- itself (matching record_audit_event()'s own division of responsibility).
create or replace function public.record_product_price(
  p_product_id uuid,
  p_branch_id uuid,
  p_price numeric,
  p_changed_by uuid
)
returns uuid
language sql
security definer
set search_path = public
as $$
  insert into public.product_prices (product_id, branch_id, price, changed_by)
  values (p_product_id, p_branch_id, p_price, p_changed_by)
  returning id;
$$;

revoke execute on function public.record_product_price(uuid, uuid, numeric, uuid) from public;
grant execute on function public.record_product_price(uuid, uuid, numeric, uuid) to authenticated;
