-- Variants reuse the products.* permission keys (this milestone's Security
-- Requirements name only products.create/update/archive — a variant is
-- part of its parent product's own mutation surface, not a separate
-- permissioned resource). `business_unit_id` is denormalized and
-- trigger-maintained (see create_product_variants.sql), so the same
-- direct-column shape as products_select/insert/update applies here.
create policy product_variants_select on public.product_variants
  for select
  using (
    public.user_has_business_unit_access(
      business_unit_id,
      (select branch_id from public.business_units where id = business_unit_id)
    )
  );

create policy product_variants_insert on public.product_variants
  for insert
  with check (
    public.user_has_business_unit_access(
      business_unit_id,
      (select branch_id from public.business_units where id = business_unit_id)
    )
    and public.user_has_permission(
      'products.create',
      (
        select b.organization_id
        from public.business_units bu
        join public.branches b on b.id = bu.branch_id
        where bu.id = business_unit_id
      )
    )
  );

create policy product_variants_update on public.product_variants
  for update
  using (
    public.user_has_business_unit_access(
      business_unit_id,
      (select branch_id from public.business_units where id = business_unit_id)
    )
    and public.user_has_permission(
      'products.update',
      (
        select b.organization_id
        from public.business_units bu
        join public.branches b on b.id = bu.branch_id
        where bu.id = business_unit_id
      )
    )
  )
  with check (
    public.user_has_business_unit_access(
      business_unit_id,
      (select branch_id from public.business_units where id = business_unit_id)
    )
    and public.user_has_permission(
      'products.update',
      (
        select b.organization_id
        from public.business_units bu
        join public.branches b on b.id = bu.branch_id
        where bu.id = business_unit_id
      )
    )
  );
