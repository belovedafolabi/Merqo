-- Milestone 15 audit finding 2 (MEDIUM) — see
-- docs/milestones/15-audit/findings-and-fixes.md.
--
-- roles_select (20260822094500) and role_permissions_select
-- (20260822094700) were both `for select to authenticated using (true)`.
-- That was correct for the catalog those tables held when the policies were
-- written — Milestone 03 seeded a fixed set of system roles, and a global
-- catalog readable by every authenticated user leaks nothing.
--
-- Milestone 11 changed the facts underneath them without revisiting them:
-- the custom-role builder made `roles` a table that also holds
-- tenant-authored rows. Since then, any authenticated user of any
-- organization could read every other organization's custom role names and
-- their exact permission mappings — a description of how a competitor
-- structures their staff authority, and a map of which roles to target.
-- This is precisely the class of issue Milestone 15 exists to catch: each
-- policy was individually correct when written, and the gap only opened
-- because a later milestone changed what the table contained.
--
-- The predicate goes through created_by because `roles` has no
-- organization_id: 20260822090900 deliberately declined to add scope
-- columns, and Milestone 03 then chose to scope role *assignments*
-- (user_roles) rather than roles themselves. created_by is the only tenancy
-- link that exists. user_shares_org_with() (20260822093300, re-created in
-- 20260824090100 and 20260825100500) already implements exactly the
-- "same-organization" test needed here and is what users_select uses, so
-- this reuses it rather than introducing a second notion of same-org.
--
-- KNOWN LIMITATION, deliberately accepted and deferred to Milestone 16:
-- roles.created_by is `on delete set null`, so deleting an author's auth
-- identity would orphan their custom role into invisibility for everyone.
-- Unreachable today — Milestone 11 deactivates users (sets deactivated_at)
-- and never deletes rows — but the durable fix is adding
-- roles.organization_id, backfilled from the creator, and predicating on
-- that instead. Recorded in docs/milestones/DECISIONS_AND_CONFLICTS.md.
--
-- VERIFIED SAFE BEFORE SHIPPING: permission resolution does NOT read
-- role_permissions through PostgREST. lib/auth/context.ts's
-- fetchPermissionGrants() calls the current_user_permission_grants() RPC,
-- which is SECURITY DEFINER and therefore unaffected by these policies. Had
-- it read the table directly, this migration would have broken sign-in for
-- every custom-role holder. The only direct reads are the role builder's own
-- (lib/roles/queries.ts, lib/roles/mutations.ts), which are same-org by
-- construction and so still satisfy the new predicate.

-- One helper so the visibility rule lives in exactly one place. The
-- role_permissions policy needs the same test as the roles policy, and
-- 20260824090800's own note about not keeping two copies of a role
-- predicate applies with equal force here.
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
        or r.created_by = auth.uid()
        or (r.created_by is not null and public.user_shares_org_with(r.created_by))
      )
  );
$$;

revoke execute on function public.role_is_visible(uuid) from public;
grant execute on function public.role_is_visible(uuid) to authenticated;

-- System roles stay globally readable: they are the shared catalog every
-- organization's role builder composes against, they carry no tenant
-- information, and supabase/seed.sql creates them with created_by null.
--
-- `created_by = auth.uid()` is not redundant with the share test: an author
-- whose own role assignments have not been resolved yet (mid-bootstrap)
-- must still see the role they just created.
drop policy roles_select on public.roles;

create policy roles_select on public.roles
  for select
  to authenticated
  using (
    is_system_role
    or created_by = auth.uid()
    or (created_by is not null and public.user_shares_org_with(created_by))
  );

-- A role's permission mapping is exactly as sensitive as the role itself, so
-- it inherits the same visibility rather than restating it. Table-qualified
-- role_permissions.role_id for the same reason 20260824090800 qualifies its
-- references: the helper's body selects from `roles`, which has its own id.
drop policy role_permissions_select on public.role_permissions;

create policy role_permissions_select on public.role_permissions
  for select
  to authenticated
  using (public.role_is_visible(role_permissions.role_id));
