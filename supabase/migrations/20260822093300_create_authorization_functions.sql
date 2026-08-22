-- The security-definer helper-function pattern this milestone establishes
-- (docs/Supabase_RLS_and_Database_Authorization_Design.md §16.6): every RLS
-- policy authored from here on calls into these functions rather than
-- repeating the scope-resolution join inline, and the app-layer guard
-- (lib/auth/*) reads from the same current_user_permission_grants() so RLS
-- and application authorization can never quietly drift apart.
--
-- All SECURITY DEFINER + STABLE + a pinned search_path: they read
-- user_roles/role_permissions/permissions on the caller's behalf regardless
-- of what RLS would otherwise allow the calling role to see directly (the
-- deliberate exception to RLS the pattern exists for), and a pinned
-- search_path prevents a malicious search_path from redirecting an unqualified
-- table reference.

-- Any role assignment — at any scope — within the given organization.
create or replace function public.user_has_org_access(p_organization_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.organization_id = p_organization_id
  );
$$;

-- Org-wide grant (branch_id null) covers every branch in that org; otherwise
-- the grant must name this exact branch.
--
-- Takes p_organization_id as a caller-supplied argument rather than looking
-- it up via `join public.branches` on p_branch_id: a nested query back onto
-- `branches` from inside this function does not reliably see a branch row
-- being inserted in the SAME statement that calls this function via the
-- branches_select policy's RETURNING-clause check (Postgres's row-security
-- machinery evaluates that check before the inserting statement's own write
-- is visible to a fresh scan) — insert-then-select-back-immediately (exactly
-- what `.insert().select()` does) would then incorrectly deny the very row
-- the caller just legitimately created. Every caller already has
-- organization_id directly on hand (it's a column on branches, and on every
-- other row that references a branch), so no self-referential lookup is
-- needed at all — this is also simply cheaper than the join it replaces.
create or replace function public.user_has_branch_access(p_branch_id uuid, p_organization_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.organization_id = p_organization_id
      and (ur.branch_id is null or ur.branch_id = p_branch_id)
  );
$$;

-- Org-wide or branch-wide grants cover every business unit under them;
-- otherwise the grant must name this exact business unit.
--
-- Takes p_branch_id directly (same reasoning as user_has_branch_access
-- above) instead of looking it up via `join public.business_units` on
-- p_business_unit_id, so a business unit's own insert+RETURNING isn't
-- subject to the same self-referential visibility problem. The join onto
-- `branches` below is safe: business units and branches are different
-- tables, so a business_units row being inserted this statement never
-- affects visibility of the (already-existing) branches row.
create or replace function public.user_has_business_unit_access(p_business_unit_id uuid, p_branch_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    join public.branches b on b.id = p_branch_id
    where ur.user_id = auth.uid()
      and ur.organization_id = b.organization_id
      and (ur.branch_id is null or ur.branch_id = p_branch_id)
      and (ur.business_unit_id is null or ur.business_unit_id = p_business_unit_id)
  );
$$;

-- Used by the users-table SELECT policy: can the caller see this other
-- user's row because they share at least one organization?
create or replace function public.user_shares_org_with(p_target_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles mine
    join public.user_roles theirs
      on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid()
      and theirs.user_id = p_target_user_id
  );
$$;

-- The caller's fully resolved permission grants, each carrying the scope it
-- was granted at. This is the one place "User -> Role(s) -> Permissions,
-- each role assignment carrying a scope" (this milestone's own Functional
-- Requirements) gets computed — both user_has_permission() below and
-- lib/auth/context.ts's fetchPermissionGrants() read from it.
create or replace function public.current_user_permission_grants()
returns table (
  permission_key text,
  organization_id uuid,
  branch_id uuid,
  business_unit_id uuid
)
language sql
security definer
stable
set search_path = public
as $$
  select distinct p.key, ur.organization_id, ur.branch_id, ur.business_unit_id
  from public.user_roles ur
  join public.role_permissions rp on rp.role_id = ur.role_id
  join public.permissions p on p.id = rp.permission_id
  where ur.user_id = auth.uid();
$$;

-- Convenience wrapper for use directly inside a policy's USING/WITH CHECK
-- clause: does the caller hold permission_key at (or above, per the scope
-- hierarchy) the given organization/branch/business-unit?
create or replace function public.user_has_permission(
  p_permission_key text,
  p_organization_id uuid,
  p_branch_id uuid default null,
  p_business_unit_id uuid default null
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.current_user_permission_grants() g
    where g.permission_key = p_permission_key
      and g.organization_id = p_organization_id
      and (g.branch_id is null or g.branch_id = p_branch_id)
      and (g.business_unit_id is null or g.business_unit_id = p_business_unit_id)
  );
$$;

-- Explicit grants rather than relying on Postgres's default
-- grant-EXECUTE-to-PUBLIC-on-new-functions behavior — these are read/scope
-- checks only (each is a no-op for a caller with no session, since
-- auth.uid() is null), but "deliberate" is the standard this milestone's
-- Security Requirements set, not "happens to work by default".
revoke execute on function public.user_has_org_access(uuid) from public;
revoke execute on function public.user_has_branch_access(uuid, uuid) from public;
revoke execute on function public.user_has_business_unit_access(uuid, uuid) from public;
revoke execute on function public.user_shares_org_with(uuid) from public;
revoke execute on function public.current_user_permission_grants() from public;
revoke execute on function public.user_has_permission(text, uuid, uuid, uuid) from public;

grant execute on function public.user_has_org_access(uuid) to authenticated;
grant execute on function public.user_has_branch_access(uuid, uuid) to authenticated;
grant execute on function public.user_has_business_unit_access(uuid, uuid) to authenticated;
grant execute on function public.user_shares_org_with(uuid) to authenticated;
grant execute on function public.current_user_permission_grants() to authenticated;
grant execute on function public.user_has_permission(text, uuid, uuid, uuid) to authenticated;
