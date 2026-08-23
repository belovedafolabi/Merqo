-- Tenant data scoped like the business_units row it configures (same shape
-- as business_unit_capabilities' own policies). No DELETE policy — a POS
-- config row is only ever removed by its Business Unit's own cascade.
--
-- Mutations require business_units.configure_pos specifically, not the
-- coarser business_units.update, per this milestone's Security Requirements
-- ("Discount-policy configuration itself is a sensitive setting... restricted
-- to Owner/Admin-level permissions by default") — seeded to the Owner role
-- only (supabase/seed.sql), not Branch Manager.
create policy business_unit_pos_config_select on public.business_unit_pos_config
  for select
  using (
    public.user_has_business_unit_access(
      business_unit_id,
      (select branch_id from public.business_units where id = business_unit_id)
    )
  );

create policy business_unit_pos_config_insert on public.business_unit_pos_config
  for insert
  with check (
    public.user_has_business_unit_access(
      business_unit_id,
      (select branch_id from public.business_units where id = business_unit_id)
    )
    and public.user_has_permission(
      'business_units.configure_pos',
      (
        select b.organization_id
        from public.business_units bu
        join public.branches b on b.id = bu.branch_id
        where bu.id = business_unit_id
      )
    )
  );

create policy business_unit_pos_config_update on public.business_unit_pos_config
  for update
  using (
    public.user_has_business_unit_access(
      business_unit_id,
      (select branch_id from public.business_units where id = business_unit_id)
    )
    and public.user_has_permission(
      'business_units.configure_pos',
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
      'business_units.configure_pos',
      (
        select b.organization_id
        from public.business_units bu
        join public.branches b on b.id = bu.branch_id
        where bu.id = business_unit_id
      )
    )
  );
