-- This milestone's capability-override UI/Server Actions
-- (updateBusinessUnitCapabilities, app/(app)/business-structure/actions.ts)
-- are the "authenticated-user mutation policy" 20260822094300's own comment
-- deferred to Milestone 05. No INSERT policy: every row is created only by
-- the seed_business_unit_capabilities() SECURITY DEFINER trigger at Business
-- Unit creation time (20260822090800_create_business_unit_capabilities.sql)
-- — overriding a capability is always an UPDATE of an existing seeded row,
-- never a fresh insert. Gated on business_units.update (the same coarse
-- permission that already covers editing a business unit's other fields),
-- not a dedicated permission — unlike POS config, capability overrides
-- aren't singled out as a distinct sensitive setting in this milestone's
-- Security Requirements.
create policy business_unit_capabilities_update on public.business_unit_capabilities
  for update
  using (
    public.user_has_business_unit_access(
      business_unit_id,
      (select branch_id from public.business_units where id = business_unit_id)
    )
    and public.user_has_permission(
      'business_units.update',
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
      'business_units.update',
      (
        select b.organization_id
        from public.business_units bu
        join public.branches b on b.id = bu.branch_id
        where bu.id = business_unit_id
      )
    )
  );
