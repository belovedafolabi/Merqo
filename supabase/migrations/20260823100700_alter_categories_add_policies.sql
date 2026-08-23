-- Tenant data scoped like the business_units row it belongs to — same shape
-- as business_units_select/insert/update
-- (20260822093900_alter_business_units_add_policies.sql). Archiving is an
-- UPDATE of `archived_at`, so no separate DELETE policy is needed.
create policy categories_select on public.categories
  for select
  using (
    public.user_has_business_unit_access(
      business_unit_id,
      (select branch_id from public.business_units where id = business_unit_id)
    )
  );

create policy categories_insert on public.categories
  for insert
  with check (
    public.user_has_business_unit_access(
      business_unit_id,
      (select branch_id from public.business_units where id = business_unit_id)
    )
    and public.user_has_permission(
      'categories.manage',
      (
        select b.organization_id
        from public.business_units bu
        join public.branches b on b.id = bu.branch_id
        where bu.id = business_unit_id
      )
    )
  );

create policy categories_update on public.categories
  for update
  using (
    public.user_has_business_unit_access(
      business_unit_id,
      (select branch_id from public.business_units where id = business_unit_id)
    )
    and public.user_has_permission(
      'categories.manage',
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
      'categories.manage',
      (
        select b.organization_id
        from public.business_units bu
        join public.branches b on b.id = bu.branch_id
        where bu.id = business_unit_id
      )
    )
  );
