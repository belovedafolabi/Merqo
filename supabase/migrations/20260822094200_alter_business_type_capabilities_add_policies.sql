-- Per-Business-Type default flags — still platform-wide reference data (it
-- describes business_types, not a specific tenant's business_units),
-- readable by any authenticated user, migration/seed-managed only.
create policy business_type_capabilities_select on public.business_type_capabilities
  for select
  to authenticated
  using (true);
