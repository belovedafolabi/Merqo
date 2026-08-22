-- Adds the scope columns Milestone 02 explicitly deferred here ("Milestone
-- 03 adds organization_id/branch_id/business_unit_id scope per its own
-- Database Changes, e.g. 'Branch Manager @ Abuja Branch'", docs/TAS.md §24).
--
-- Scope hierarchy (nulls widen, never narrow):
--   organization_id only              -> organization-wide grant
--   organization_id + branch_id       -> branch-wide grant (every business
--                                        unit under that branch)
--   organization_id + branch_id + bu  -> single business-unit grant
-- branch_id/business_unit_id can never legitimately disagree with
-- organization_id, so a trigger (below) enforces that consistency the same
-- way a foreign key would if Postgres supported cross-table composite FKs.
alter table public.user_roles
  add column organization_id uuid references public.organizations(id) on delete restrict,
  add column branch_id uuid references public.branches(id) on delete restrict,
  add column business_unit_id uuid references public.business_units(id) on delete restrict;

-- Backfill is impossible (no scope existed before this migration) — there is
-- no pre-existing data in a greenfield project, so NOT NULL is applied
-- directly rather than added as a later, separate migration.
alter table public.user_roles
  alter column organization_id set not null;

create or replace function public.validate_user_role_scope()
returns trigger
language plpgsql
as $$
declare
  branch_org_id uuid;
  bu_branch_id uuid;
begin
  if new.branch_id is not null then
    select organization_id into branch_org_id from public.branches where id = new.branch_id;
    if branch_org_id is null or branch_org_id <> new.organization_id then
      raise exception 'user_roles.branch_id % does not belong to organization_id %',
        new.branch_id, new.organization_id;
    end if;
  end if;

  if new.business_unit_id is not null then
    if new.branch_id is null then
      raise exception 'user_roles.business_unit_id requires branch_id to also be set';
    end if;
    select branch_id into bu_branch_id from public.business_units where id = new.business_unit_id;
    if bu_branch_id is null or bu_branch_id <> new.branch_id then
      raise exception 'user_roles.business_unit_id % does not belong to branch_id %',
        new.business_unit_id, new.branch_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_user_roles_validate_scope
  before insert or update on public.user_roles
  for each row execute function public.validate_user_role_scope();

-- Replaces the Milestone 02 (user_id, role_id) unique index: a user can
-- legitimately hold the same role at two different scopes (e.g. Branch
-- Manager at both Wuse and Garki), so uniqueness must include scope. Postgres
-- treats NULL as distinct-from-itself in a plain unique index, which would
-- let the same (user, role, org) with two NULL branch_id rows through
-- unnoticed — coalescing to a fixed nil UUID sentinel closes that gap.
drop index public.user_roles_unique;

create unique index user_roles_scope_unique on public.user_roles (
  user_id,
  role_id,
  organization_id,
  coalesce(branch_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(business_unit_id, '00000000-0000-0000-0000-000000000000')
);

create index user_roles_organization_id_idx on public.user_roles (organization_id);
create index user_roles_branch_id_idx on public.user_roles (branch_id);
create index user_roles_business_unit_id_idx on public.user_roles (business_unit_id);
