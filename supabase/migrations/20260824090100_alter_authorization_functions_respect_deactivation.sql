-- Makes deactivation (20260824090000_alter_users_add_deactivated_at.sql) an
-- immediate, session-invalidating revocation rather than a login-time block.
--
-- WHY THIS IS THE REAL BOUNDARY
--
-- A JWT was never the authorization in this schema — it only establishes
-- auth.uid(). Every RLS policy written since Milestone 03 resolves through
-- one of the six functions in 20260822093300_create_authorization_functions.sql.
-- Gate those on the caller's active state and an already-issued, still-
-- unexpired access token yields zero permission grants and false from every
-- scope check the instant deactivated_at is set — no token revocation, no
-- session store lookup, no cache to invalidate. That covers a raw
-- `POST /rest/v1/...` from curl exactly as it covers the app, because it is
-- the database, not the application, doing the refusing.
--
-- set_employee_active() additionally deletes the target's GoTrue session
-- rows so the refresh token dies too, and proxy.ts signs them out for UX.
-- Those are defence 2 and 3. This file is defence 1, and the only one that
-- holds if the other two are bypassed.
--
-- ALWAYS GATE ON THE CALLER, NEVER ON THE ARGUMENT
--
-- Each function below checks public.user_is_active() — which reads
-- auth.uid() — and never the state of whatever user the arguments name.
-- user_shares_org_with(p_target_user_id) is the case that makes this
-- explicit: an ACTIVE admin must still see a DEACTIVATED colleague's
-- users row, or the employee directory would hide the very people it exists
-- to manage and reactivation would be impossible through the UI.

create or replace function public.user_is_active()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.deactivated_at is null
  );
$$;

comment on function public.user_is_active() is
  'True when the caller has an app user row and is not deactivated. Every '
  'other authorization function gates on this, making deactivation effective '
  'immediately against already-issued JWTs.';

-- The six functions below are re-created verbatim from
-- 20260822093300_create_authorization_functions.sql with the active-caller
-- gate added. Their original explanatory comments live in that file and are
-- not duplicated here; the only change in each body is the added conjunct.

create or replace function public.user_has_org_access(p_organization_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.user_is_active() and exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.organization_id = p_organization_id
  );
$$;

create or replace function public.user_has_branch_access(p_branch_id uuid, p_organization_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.user_is_active() and exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.organization_id = p_organization_id
      and (ur.branch_id is null or ur.branch_id = p_branch_id)
  );
$$;

create or replace function public.user_has_business_unit_access(p_business_unit_id uuid, p_branch_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.user_is_active() and exists (
    select 1 from public.user_roles ur
    join public.branches b on b.id = p_branch_id
    where ur.user_id = auth.uid()
      and ur.organization_id = b.organization_id
      and (ur.branch_id is null or ur.branch_id = p_branch_id)
      and (ur.business_unit_id is null or ur.business_unit_id = p_business_unit_id)
  );
$$;

-- `mine.user_id = auth.uid()` plus the caller-side gate. `theirs` is
-- deliberately NOT filtered on deactivated_at — see the header note.
create or replace function public.user_shares_org_with(p_target_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.user_is_active() and exists (
    select 1
    from public.user_roles mine
    join public.user_roles theirs
      on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid()
      and theirs.user_id = p_target_user_id
  );
$$;

-- The single most important one: a deactivated caller resolves to zero
-- grants, so lib/auth/context.ts's getCurrentOrganizationId() (which reads
-- grants[0]) goes null and every requirePermission() in the app throws.
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
  where ur.user_id = auth.uid()
    and public.user_is_active();
$$;

-- Reads current_user_permission_grants(), so it is already covered
-- transitively; the explicit conjunct is kept so this function is correct
-- read in isolation and stays correct if its implementation ever changes.
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
  select public.user_is_active() and exists (
    select 1 from public.current_user_permission_grants() g
    where g.permission_key = p_permission_key
      and g.organization_id = p_organization_id
      and (g.branch_id is null or g.branch_id = p_branch_id)
      and (g.business_unit_id is null or g.business_unit_id = p_business_unit_id)
  );
$$;

-- create or replace preserves existing grants on the six replaced functions,
-- so only the new one needs the revoke/grant pair — same "deliberate, not
-- default" standard as the original migration.
revoke execute on function public.user_is_active() from public;
grant execute on function public.user_is_active() to authenticated;
