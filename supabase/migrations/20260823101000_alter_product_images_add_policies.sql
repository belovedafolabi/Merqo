-- product_images has no business_unit_id of its own — resolved through its
-- parent product, same join-through-parent shape as
-- business_unit_pos_config's policies (20260823090200). Mutations require
-- products.update (adding/reordering/removing images is part of editing a
-- product, not a separate permission).
create policy product_images_select on public.product_images
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

create policy product_images_insert on public.product_images
  for insert
  with check (
    public.user_has_permission(
      'products.update',
      (
        select b.organization_id
        from public.products p
        join public.business_units bu on bu.id = p.business_unit_id
        join public.branches b on b.id = bu.branch_id
        where p.id = product_id
      )
    )
  );

create policy product_images_update on public.product_images
  for update
  using (
    public.user_has_permission(
      'products.update',
      (
        select b.organization_id
        from public.products p
        join public.business_units bu on bu.id = p.business_unit_id
        join public.branches b on b.id = bu.branch_id
        where p.id = product_id
      )
    )
  )
  with check (
    public.user_has_permission(
      'products.update',
      (
        select b.organization_id
        from public.products p
        join public.business_units bu on bu.id = p.business_unit_id
        join public.branches b on b.id = bu.branch_id
        where p.id = product_id
      )
    )
  );

create policy product_images_delete on public.product_images
  for delete
  using (
    public.user_has_permission(
      'products.update',
      (
        select b.organization_id
        from public.products p
        join public.business_units bu on bu.id = p.business_unit_id
        join public.branches b on b.id = bu.branch_id
        where p.id = product_id
      )
    )
  );
