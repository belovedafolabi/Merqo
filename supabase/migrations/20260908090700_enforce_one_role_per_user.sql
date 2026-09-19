-- Milestone 17 Part E item 5: a user may hold exactly one role.
--
-- REVERSES A DOCUMENTED DECISION. `user_roles` was deliberately a many-to-many
-- so one person could be "Cashier + Inventory Supervisor", or hold one role at
-- several branch scopes. That is stated in docs/Users_Employees_Roles_and_
-- Granular_RBAC.md §25.15, docs/Functional_Specification.md §432,
-- docs/Auth_Users_Roles_Authorization.md §20, docs/Database_Archutecture_and_
-- Model.md, and Milestone 03's test list. The product owner has chosen a
-- single role per user instead; the full rationale and consequences are in
-- docs/milestones/DECISIONS_AND_CONFLICTS.md §8.
--
-- Consequence: a user who held one role at two branch scopes would need a
-- single org-wide row, which widens their reach. No such user exists in any
-- current deployment (checked), and the collapse below keeps the org-wide row
-- when there is a choice.
--
-- This migration:
--   1. collapses every user to their single highest-privilege assignment,
--      writing an audit row for each assignment it removes so the change is
--      reversible from the log;
--   2. replaces the non-unique user_roles(user_id) index with a UNIQUE one,
--      which is the actual invariant from here on.
--
-- The scope trigger (validate_user_role_scope) and the self-elevation guard
-- (user_grants_cover_role, on the insert/update policies) are untouched — this
-- adds a cardinality constraint, it does not relax anything.

-- ---------------------------------------------------------------------------
-- 1. Collapse. "Highest privilege" is data-driven so it works for custom roles
--    too: most role_permissions first, then an org-wide assignment ahead of a
--    branch/BU-scoped one, then the oldest assignment. Exactly one row per user
--    survives.
-- ---------------------------------------------------------------------------
with ranked as (
  select
    ur.id,
    ur.user_id,
    row_number() over (
      partition by ur.user_id
      order by
        (select count(*) from public.role_permissions rp where rp.role_id = ur.role_id) desc,
        (ur.branch_id is null and ur.business_unit_id is null) desc,
        ur.created_at asc,
        ur.id asc
    ) as rn
  from public.user_roles ur
),
removed as (
  delete from public.user_roles ur
  using ranked
  where ur.id = ranked.id
    and ranked.rn > 1
  returning ur.id, ur.user_id, ur.organization_id, ur.role_id,
            ur.branch_id, ur.business_unit_id, ur.created_at
)
insert into public.audit_logs (organization_id, user_id, action, resource_type, resource_id, metadata)
select
  removed.organization_id,
  removed.user_id,
  'user_role.removed_one_role_migration',
  'user_role',
  removed.id,
  jsonb_build_object(
    'role_id', removed.role_id,
    'role_slug', r.slug,
    'branch_id', removed.branch_id,
    'business_unit_id', removed.business_unit_id,
    'assigned_at', removed.created_at,
    'reason', 'Milestone 17 Part E item 5 — collapsed to one role per user; kept the highest-privilege assignment'
  )
from removed
join public.roles r on r.id = removed.role_id;

-- ---------------------------------------------------------------------------
-- 2. The invariant. A UNIQUE index on (user_id) also serves the lookups the
--    old non-unique user_roles_user_id_idx covered, so replace it rather than
--    keep both.
-- ---------------------------------------------------------------------------
drop index if exists public.user_roles_user_id_idx;
create unique index user_roles_user_id_key on public.user_roles (user_id);
