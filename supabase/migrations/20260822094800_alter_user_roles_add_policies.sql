-- The actual scope-assignment table — the most security-sensitive one this
-- milestone adds policies for. roles.assign covers both granting and
-- revoking (a separate roles.revoke permission would only add catalog
-- bloat for a distinction this milestone doesn't need — see
-- docs/architecture/database-conventions.md's preference for typed columns
-- over speculative granularity).
-- `user_id = auth.uid()` is a direct column comparison against the row's own
-- tuple, always correctly visible. The second branch deliberately uses
-- user_has_org_access(organization_id) — not user_shares_org_with(user_id) —
-- because organization_id is a column already present on this row (no
-- re-query needed), whereas user_shares_org_with() would query user_roles
-- back onto itself and, like the branches/business_units self-reference bug
-- documented in 20260822093300_create_authorization_functions.sql, fail to
-- see a freshly-inserted row when a Server Action assigns a role to someone
-- else and immediately reads it back via `.insert().select()`.
create policy user_roles_select on public.user_roles
  for select
  using (
    user_id = auth.uid()
    or (
      public.user_has_org_access(organization_id)
      and public.user_has_permission('roles.view', organization_id)
    )
  );

create policy user_roles_insert on public.user_roles
  for insert
  with check (public.user_has_permission('roles.assign', organization_id));

create policy user_roles_update on public.user_roles
  for update
  using (public.user_has_permission('roles.assign', organization_id))
  with check (public.user_has_permission('roles.assign', organization_id));

create policy user_roles_delete on public.user_roles
  for delete
  using (public.user_has_permission('roles.assign', organization_id));
