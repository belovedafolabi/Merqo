-- branches.archive is seeded (supabase/seed.sql) and enforced at the Server
-- Action layer (Milestone 05) for the archive-specific business rule; RLS
-- here provides the coarser, database-level boundary via branches.update —
-- "API Authorization provides business logic, RLS provides database-level
-- isolation" (docs/Supabase_RLS_and_Database_Authorization_Design.md §16.46).
create policy branches_select on public.branches
  for select
  using (public.user_has_branch_access(id, organization_id));

create policy branches_insert on public.branches
  for insert
  with check (
    public.user_has_org_access(organization_id)
    and public.user_has_permission('branches.create', organization_id)
  );

create policy branches_update on public.branches
  for update
  using (
    public.user_has_branch_access(id, organization_id)
    and public.user_has_permission('branches.update', organization_id)
  )
  with check (
    public.user_has_branch_access(id, organization_id)
    and public.user_has_permission('branches.update', organization_id)
  );
