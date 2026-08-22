-- The permission catalog is code/migration-seeded only, never editable by
-- any application role — no mutation policy exists, or ever should. Readable
-- by any authenticated user (needed to render a role's permission list).
create policy permissions_select on public.permissions
  for select
  to authenticated
  using (true);
