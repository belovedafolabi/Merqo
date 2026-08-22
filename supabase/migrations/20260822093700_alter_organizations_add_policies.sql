-- First real RLS policies (this milestone's core deliverable). No INSERT
-- policy: organization creation only ever happens through
-- create_organization_with_owner(), a SECURITY DEFINER function running as
-- the table owner, which bypasses RLS by Postgres's own table-owner rule —
-- see 20260822093600_create_organization_bootstrap_function.sql. No DELETE
-- policy: hard deletion of organizations is excluded by design (default-deny
-- is correct, not an oversight).
create policy organizations_select on public.organizations
  for select
  using (public.user_has_org_access(id));

create policy organizations_update on public.organizations
  for update
  using (public.user_has_org_access(id) and public.user_has_permission('organizations.update', id))
  with check (public.user_has_org_access(id) and public.user_has_permission('organizations.update', id));
