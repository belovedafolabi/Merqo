-- Unlike inventory_balances/inventory_movements, `batches` is an
-- informational record (this milestone's own Database Changes note) and
-- isn't part of the balance/movement atomicity guarantee, so it gets an
-- ordinary INSERT/UPDATE policy gated on `inventory.adjust` — same shape as
-- products_insert/products_update — rather than a dedicated RPC function.
create policy batches_select on public.batches
  for select
  using (
    public.user_has_branch_access(
      branch_id,
      (select organization_id from public.branches where id = branch_id)
    )
  );

create policy batches_insert on public.batches
  for insert
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

create policy batches_update on public.batches
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
