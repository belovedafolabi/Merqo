-- Same shape as business_units_select/insert/update — products has no
-- organization_id of its own (belongs to a business unit, which belongs to
-- a branch, which belongs to an organization), so mutation checks resolve
-- the owning organization through business_units -> branches. No DELETE
-- policy: archiving is an UPDATE of `archived_at` (this milestone's FR:
-- "Product archiving (not hard deletion)... preserving historical sale
-- references").
create policy products_select on public.products
  for select
  using (
    public.user_has_business_unit_access(
      business_unit_id,
      (select branch_id from public.business_units where id = business_unit_id)
    )
  );

create policy products_insert on public.products
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

create policy products_update on public.products
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
