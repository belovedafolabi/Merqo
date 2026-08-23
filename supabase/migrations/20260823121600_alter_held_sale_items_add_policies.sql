-- Resolved through the parent held_sale, same shape as sale_items_select —
-- but ordinary INSERT/DELETE policies too (not RPC-only), matching
-- held_sales' own mutable-draft shape. `on delete cascade`
-- (20260823120700_create_held_sale_items.sql) handles cleanup when the
-- parent held_sales row itself is deleted; this DELETE policy covers
-- removing a single line before that (e.g. the cashier drops one item from
-- a held cart without discarding the whole hold).
create policy held_sale_items_select on public.held_sale_items
  for select
  using (
    exists (
      select 1 from public.held_sales hs
      where hs.id = held_sale_id
        and public.user_has_branch_access(hs.branch_id, hs.organization_id)
    )
  );

create policy held_sale_items_insert on public.held_sale_items
  for insert
  with check (
    exists (
      select 1 from public.held_sales hs
      where hs.id = held_sale_id
        and public.user_has_branch_access(hs.branch_id, hs.organization_id)
        and public.user_has_permission('sales.create', hs.organization_id, hs.branch_id)
    )
  );

create policy held_sale_items_delete on public.held_sale_items
  for delete
  using (
    exists (
      select 1 from public.held_sales hs
      where hs.id = held_sale_id
        and public.user_has_branch_access(hs.branch_id, hs.organization_id)
        and (
          public.user_has_permission('sales.create', hs.organization_id, hs.branch_id)
          or public.user_has_permission('sales.cancel', hs.organization_id, hs.branch_id)
        )
    )
  );
