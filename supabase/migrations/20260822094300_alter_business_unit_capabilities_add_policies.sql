-- Unlike business_type_capabilities (platform-wide defaults), this table is
-- tenant data — a specific Business Unit's actual flags — so it's scoped
-- like the business_units row it belongs to. No mutation policy yet: the
-- only writer today is the SECURITY DEFINER seed_business_unit_capabilities()
-- trigger (see 20260822093650_alter_seed_business_unit_capabilities_security_definer.sql),
-- which bypasses RLS as intended; the capability-override UI/Server Actions
-- that would need an authenticated-user mutation policy are Milestone 05's.
create policy business_unit_capabilities_select on public.business_unit_capabilities
  for select
  using (
    public.user_has_business_unit_access(
      business_unit_id,
      (select branch_id from public.business_units where id = business_unit_id)
    )
  );
