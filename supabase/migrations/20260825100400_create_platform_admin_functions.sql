-- The Super Admin's untethered-access primitive and its provisioning
-- function (docs/milestones/13-subscription-billing-and-platform-admin.md
-- Functional Requirements: "The Super Admin can always log in and access the
-- system regardless of the organization's subscription status"; resolves
-- DECISIONS_AND_CONFLICTS.md §5: single-tenant untethered role within this
-- one deployment, confirmed 2026-08-25 — not a cross-client console).
--
-- user_is_platform_admin() deliberately does NOT call
-- current_user_permission_grants() or user_has_permission() — both of those
-- (as of 20260825100500) consult organization_access_permitted(), which
-- itself calls user_is_platform_admin(). Routing through them here would be
-- infinite recursion. This hand-rolled join is required, not a style choice.
--
-- It checks a PERMISSION KEY ('platform.override'), never roles.slug — the
-- hard rule from docs/milestones/03-authentication-and-rbac-foundation.md
-- ("no authorization decision anywhere checks a role's name directly") holds
-- here exactly as everywhere else. 'super_admin' is merely the seeded role
-- that happens to carry this key; nothing stops a future role from carrying
-- it too, though supabase/seed.sql's escalation guard (20260824090900)
-- prevents any role OTHER than one built by an existing platform.override
-- holder from acquiring it.
--
-- No organization_id parameter, unlike every other user_has_*_access
-- function in this schema. That absence IS the untethering this milestone's
-- Scope calls for — the only place in the whole schema that omits org
-- scoping.
create or replace function public.user_is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    join public.users u on u.id = ur.user_id
    where ur.user_id = auth.uid()
      and u.deactivated_at is null
      and p.key = 'platform.override'
  );
$$;

comment on function public.user_is_platform_admin() is
  'True when the caller holds platform.override in ANY organization scope. '
  'The one function in this schema with no organization_id parameter — '
  'deliberately untethered, per DECISIONS_AND_CONFLICTS.md §5. Consulted by '
  'organization_access_permitted() (20260825100500) as the subscription-lock '
  'exemption, and by RLS policies that need platform-admin-only visibility '
  '(e.g. webhook_events).';

revoke execute on function public.user_is_platform_admin() from public;
grant execute on function public.user_is_platform_admin() to authenticated;

-- One-shot provisioning: run once by the platform owner from the Supabase
-- SQL editor (or any service-role-authenticated caller) —
-- `select public.promote_to_super_admin('owner@example.com');` — see
-- README.md's Super Admin runbook. Granted to NOBODY: no application role,
-- however privileged, can call this. That is deliberate — seeding it is
-- impossible (no auth.users row exists at seed time), and an env-var-
-- designated "super admin email" would mean a startup code path silently
-- writing privileges, which is a worse security story and untestable in
-- isolation. An ungranted, audited, idempotent SQL function is explicit and
-- leaves a trail.
--
-- This is the one legitimate place roles.slug is referenced directly in the
-- whole codebase: it is PROVISIONING a role, not making an authorization
-- decision at query time, and the M03 rule is about the latter.
create or replace function public.promote_to_super_admin(
  p_email text,
  p_organization_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid;
  v_organization_id uuid := p_organization_id;
  v_super_admin_role_id uuid;
  v_user_role_id uuid;
begin
  select id into v_auth_user_id
  from auth.users
  where lower(email) = lower(p_email);

  if v_auth_user_id is null then
    raise exception 'no auth.users row for email %', p_email;
  end if;

  -- handle_new_auth_user() (20260822093000) already mirrors every auth.users
  -- row into public.users on sign-up, so this is a sanity check, not a
  -- provisioning step — a target that hasn't completed sign-up yet has no
  -- application identity to promote.
  if not exists (select 1 from public.users where id = v_auth_user_id) then
    raise exception 'auth.users % has no mirrored public.users row yet', v_auth_user_id;
  end if;

  select id into v_super_admin_role_id from public.roles where slug = 'super_admin';
  if v_super_admin_role_id is null then
    raise exception 'seeded "super_admin" role not found — has supabase/seed.sql been applied?';
  end if;

  -- Single-tenant deployment: exactly one organization exists in production,
  -- so p_organization_id is left null on the real runbook call and this
  -- resolves it automatically. The parameter exists only so a multi-
  -- organization test database (many orgs from many test files) can target
  -- a specific one — application code never passes it.
  if v_organization_id is null then
    select id into v_organization_id from public.organizations order by created_at limit 1;
  end if;
  if v_organization_id is null then
    raise exception 'no organization exists yet — bootstrap one before promoting a Super Admin';
  end if;

  insert into public.user_roles (user_id, role_id, organization_id)
  values (v_auth_user_id, v_super_admin_role_id, v_organization_id)
  on conflict do nothing
  returning id into v_user_role_id;

  perform public.record_audit_event(
    v_organization_id, v_auth_user_id, 'platform.super_admin_promoted', 'user', v_auth_user_id
  );

  return v_auth_user_id;
end;
$$;

comment on function public.promote_to_super_admin(text, uuid) is
  'Ungranted provisioning function — run once from the Supabase SQL editor. '
  'See README.md''s Super Admin runbook. Never callable from application '
  'code (no execute grant to anon/authenticated/service_role).';

revoke execute on function public.promote_to_super_admin(text, uuid) from public, anon, authenticated;
