-- Platform-wide reference catalog, not tenant data (see
-- docs/architecture/database-conventions.md's is_active-vs-archived_at
-- distinction) — readable by any authenticated user, no tenant scoping
-- needed. No mutation policy: the catalog is migration/seed-managed only in
-- this milestone (a Super Admin admin surface for adding a 14th type is
-- Milestone 13's).
create policy business_types_select on public.business_types
  for select
  to authenticated
  using (true);
