-- Same reasoning as business_types: platform-wide curated catalog, readable
-- by any authenticated user, migration/seed-managed only.
create policy capabilities_select on public.capabilities
  for select
  to authenticated
  using (true);
