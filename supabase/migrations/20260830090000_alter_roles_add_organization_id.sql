-- Milestone 16 §1.7 — the durable fix for Milestone 15 audit finding 2's
-- known limitation, handed to this milestone in
-- docs/milestones/DECISIONS_AND_CONFLICTS.md §7a.
--
-- 20260826090300 scoped roles_select / role_permissions_select to the
-- caller's organization, but `roles` has no organization_id (20260822090900
-- deliberately declined scope columns), so the predicate had to go through
-- roles.created_by — which is `on delete set null`. Deleting an author's
-- auth identity would orphan their custom role into invisibility for every
-- user in that organization. Unreachable while Milestone 11 only deactivates
-- users, but the durable fix is a real scope column, backfilled from the
-- creator, with the visibility predicate re-pointed at it.
--
-- §7a's text said "make it NOT NULL". That cannot hold: supabase/seed.sql
-- seeds eight system roles (Owner … Kitchen Staff, plus Super Admin) that
-- 20260826090300 keeps deliberately global — they are the shared catalog
-- every organization's role builder composes against and carry no tenant
-- information. A NOT NULL column would have no value to hold for them. The
-- constraint that actually models the rule is a CHECK: system roles have no
-- organization, custom roles must have one. §7a is amended to match.

-- ---------------------------------------------------------------------------
-- 1. Column
-- ---------------------------------------------------------------------------
-- `on delete restrict`, not cascade: it matches branches.organization_id and
-- docs/architecture/database-conventions.md's delete-behavior rule.
-- Organizations are soft-deleted (deactivated_at), never hard-deleted, so
-- this restrict is a backstop, not a workflow constraint.
alter table public.roles
  add column organization_id uuid references public.organizations(id) on delete restrict;

-- ---------------------------------------------------------------------------
-- 2. Backfill
-- ---------------------------------------------------------------------------
-- A custom role belongs to its creator's organization. Each user in this
-- product belongs to exactly one organization (owner-bootstrapped, and the
-- employee-invite flow assigns within one org), so the creator's single
-- user_roles row carries the answer.
--
-- On a fresh deployment this updates zero rows — the role builder is
-- Milestone 11 and nothing seeds a custom role. On an established client DB
-- it backfills every custom role in place. If a custom role's created_by is
-- null or its creator has no user_roles row (an already-orphaned role, the
-- exact case this migration exists to prevent recurring), organization_id
-- stays null and step 3's constraint fails loudly at deploy — which is
-- correct: that row needs a human decision, not a silent guess.
update public.roles r
set organization_id = (
  select ur.organization_id
  from public.user_roles ur
  where ur.user_id = r.created_by
  limit 1
)
where not r.is_system_role
  and r.organization_id is null;

-- ---------------------------------------------------------------------------
-- 3. Constraint + index
-- ---------------------------------------------------------------------------
alter table public.roles
  add constraint roles_org_scope_check check (
    (is_system_role and organization_id is null)
    or (not is_system_role and organization_id is not null)
  );

create index roles_organization_id_idx on public.roles (organization_id);

-- ---------------------------------------------------------------------------
-- 4. Re-point visibility at the new column
-- ---------------------------------------------------------------------------
-- role_is_visible() feeds role_permissions_select; roles_select restates the
-- same test inline (20260826090300's note: an author mid-bootstrap whose own
-- assignments are not resolved yet must still see the role they just
-- created — but user_has_org_access already returns true for them, because
-- assignUserRole writes the user_roles row before the builder returns). Both
-- now key on organization_id instead of the created_by chain.
--
-- user_has_org_access(uuid) (20260825100500) is the same helper users_select
-- and every scoped policy already use: active user + subscription not locked
-- + a user_roles row in that organization. Reusing it keeps "same
-- organization" defined in exactly one place.
create or replace function public.role_is_visible(p_role_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.roles r
    where r.id = p_role_id
      and (
        r.is_system_role
        or public.user_has_org_access(r.organization_id)
      )
  );
$$;

revoke execute on function public.role_is_visible(uuid) from public;
grant execute on function public.role_is_visible(uuid) to authenticated;

drop policy roles_select on public.roles;

create policy roles_select on public.roles
  for select
  to authenticated
  using (
    is_system_role
    or public.user_has_org_access(organization_id)
  );

-- ---------------------------------------------------------------------------
-- 5. Tighten the authoring policies to the same column
-- ---------------------------------------------------------------------------
-- 20260824090700's roles_insert already forces `created_by = auth.uid()`;
-- adding the org check stops a forged organization_id (a role planted in
-- another tenant) at the RLS boundary rather than trusting lib/roles to pass
-- the right value. roles_update gains it in both USING and WITH CHECK: USING
-- blocks editing another org's role, WITH CHECK blocks moving one of your
-- own roles into another org.
drop policy roles_insert on public.roles;

create policy roles_insert on public.roles
  for insert
  to authenticated
  with check (
    is_system_role = false
    and created_by = auth.uid()
    and organization_id is not null
    and public.user_has_org_access(organization_id)
    and public.user_can_author_roles()
  );

drop policy roles_update on public.roles;

create policy roles_update on public.roles
  for update
  to authenticated
  using (
    is_system_role = false
    and public.user_has_org_access(organization_id)
    and public.user_can_author_roles()
  )
  with check (
    is_system_role = false
    and public.user_has_org_access(organization_id)
    and public.user_can_author_roles()
  );
