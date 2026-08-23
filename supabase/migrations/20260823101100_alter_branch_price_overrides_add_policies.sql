-- Unlike products/product_variants, this table already carries branch_id
-- directly, so user_has_business_unit_access() takes it straight from the
-- row instead of resolving it through a business_units lookup — only the
-- product's business_unit_id needs a lookup. Mutations require
-- products.update (setting a branch override is part of a product's
-- pricing, not a separately permissioned resource).
create policy branch_price_overrides_select on public.branch_price_overrides
  for select
  using (
    public.user_has_business_unit_access(
      (select business_unit_id from public.products where id = product_id),
      branch_id
    )
  );

create policy branch_price_overrides_insert on public.branch_price_overrides
  for insert
  with check (
    public.user_has_business_unit_access(
      (select business_unit_id from public.products where id = product_id),
      branch_id
    )
    and public.user_has_permission(
      'products.update',
      (select organization_id from public.branches where id = branch_id)
    )
  );

create policy branch_price_overrides_update on public.branch_price_overrides
  for update
  using (
    public.user_has_business_unit_access(
      (select business_unit_id from public.products where id = product_id),
      branch_id
    )
    and public.user_has_permission(
      'products.update',
      (select organization_id from public.branches where id = branch_id)
    )
  )
  with check (
    public.user_has_business_unit_access(
      (select business_unit_id from public.products where id = product_id),
      branch_id
    )
    and public.user_has_permission(
      'products.update',
      (select organization_id from public.branches where id = branch_id)
    )
  );

create policy branch_price_overrides_delete on public.branch_price_overrides
  for delete
  using (
    public.user_has_business_unit_access(
      (select business_unit_id from public.products where id = product_id),
      branch_id
    )
    and public.user_has_permission(
      'products.update',
      (select organization_id from public.branches where id = branch_id)
    )
  );
