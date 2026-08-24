-- ORDERING: numbered 090250 — before the invitation table (090300) and its
-- policies (090400), not next to the role policies at 090700/090800 where it
-- would read more naturally. user_grants_cover_role() is referenced by three
-- separate policy migrations (employee_invitations, role_permissions,
-- user_roles), and a Postgres policy resolves its functions at CREATE POLICY
-- time, so the definition has to land before the earliest of them.
--
-- The primitives behind the custom-role builder's anti-self-elevation rule
-- (docs/milestones/11-administration-employees-and-branding.md Security
-- Requirements: "a non-Owner/Admin role cannot grant itself or others
-- elevated permissions... self-elevation is explicitly disallowed by
-- default"; Risks: "self-elevation and privilege-escalation bugs are the
-- primary risk in a custom-role builder").
--
-- WHY ORG-WIDE, NOT SCOPED
--
-- `public.roles` carries no organization_id, branch_id or business_unit_id —
-- a role is a bare bundle of permissions, and its scope is chosen later, at
-- assignment time, on user_roles. Milestone 11 must not add scope columns to
-- it either ("No changes to the core RBAC tables from Milestone 03 beyond
-- normal row inserts — the schema itself does not change").
--
-- That has a direct consequence for authoring: a role someone mints today
-- can be assigned org-wide tomorrow. So holding a permission at ONE BRANCH
-- is not authority to bake it into a role. The check must demand the
-- author's grant be org-wide (branch_id and business_unit_id both null),
-- which is the widest form of the grant and the only one that covers every
-- scope the resulting role could later be assigned at.
--
-- This is not a new rule, only an explicit one: user_has_permission(key, org)
-- called with a null branch already behaves this way, since `g.branch_id =
-- p_branch_id` is NULL (not true) when the argument is null, leaving
-- `g.branch_id is null` as the only branch that can match.

-- Does the caller hold this permission key with an org-wide grant?
create or replace function public.user_holds_permission_org_wide(p_permission_key text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.current_user_permission_grants() g
    where g.permission_key = p_permission_key
      and g.branch_id is null
      and g.business_unit_id is null
  );
$$;

-- May the caller author roles at all? Split out from the predicate below so
-- the policies read as "may you author" AND "may you author *this*", which
-- are two different failures worth telling apart when debugging a denial.
create or replace function public.user_can_author_roles()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.user_holds_permission_org_wide('roles.create');
$$;

-- THE GUARD. True only when the caller personally holds, org-wide, every
-- single permission the named role grants — i.e. the role is a subset of the
-- caller's own authority and handing it out gives away nothing the caller
-- did not already have.
--
-- Written as `not exists (... and not exists (...))` — "no permission in this
-- role is missing from my grants" — rather than a count comparison, so it
-- short-circuits on the first offending permission and stays correct for a
-- role with zero permissions (vacuously true: an empty role grants nothing,
-- so anyone who may author roles may create one and fill it in a step at a
-- time, each addition checked on its own by the role_permissions policy).
create or replace function public.user_grants_cover_role(p_role_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select not exists (
    select 1
    from public.role_permissions rp
    join public.permissions p on p.id = rp.permission_id
    where rp.role_id = p_role_id
      and not exists (
        select 1 from public.current_user_permission_grants() g
        where g.permission_key = p.key
          and g.branch_id is null
          and g.business_unit_id is null
      )
  );
$$;

comment on function public.user_grants_cover_role(uuid) is
  'True when every permission the role grants is one the caller already holds '
  'org-wide. Used by the user_roles and employee_invitations policies to stop '
  'someone with roles.assign handing out authority they do not themselves have.';

revoke execute on function public.user_holds_permission_org_wide(text) from public;
revoke execute on function public.user_can_author_roles() from public;
revoke execute on function public.user_grants_cover_role(uuid) from public;

grant execute on function public.user_holds_permission_org_wide(text) to authenticated;
grant execute on function public.user_can_author_roles() to authenticated;
grant execute on function public.user_grants_cover_role(uuid) to authenticated;
