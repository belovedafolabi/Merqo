-- Readable by any authenticated user (needed to render "this role grants
-- these permissions"). No mutation policy: editing a role's permission set
-- is Milestone 11's custom-role builder, same reasoning as roles/permissions
-- above.
create policy role_permissions_select on public.role_permissions
  for select
  to authenticated
  using (true);
