-- Employee deactivation, per docs/milestones/11-administration-employees-and-branding.md
-- Security Requirements: "Deactivating an employee immediately invalidates
-- their active session(s), not just future logins."
--
-- Column naming: `deactivated_at`, not the conventions doc's `archived_at`
-- (soft-delete for tenant entities: organizations/branches/business_units)
-- nor `is_active` (toggle for curated catalogs: business_types/capabilities).
-- A person is neither. The name states the security fact — access is off —
-- and the timestamp records *when*, which the audit trail needs and a
-- boolean would throw away. See docs/architecture/database-conventions.md's
-- "Soft-delete (archived_at) vs. is_active" section: two concepts, used on
-- different table categories, and this is a third.
--
-- Deliberately NO new RLS policy on public.users. The existing
-- users_update_self policy (20260822094400_alter_users_add_policies.sql) is
-- self-only, so this column is unwritable through PostgREST by anyone — an
-- admin can only change it via set_employee_active() in
-- 20260824090200_create_employee_functions.sql, which permission-checks and
-- audits. A user also cannot reactivate themselves, since a deactivated user
-- resolves to zero permission grants the moment the flag is set.
alter table public.users
  add column deactivated_at timestamptz;

comment on column public.users.deactivated_at is
  'When set, this user is deactivated: every authorization function in '
  '20260824090100_alter_authorization_functions_respect_deactivation.sql '
  'returns false/no rows for them, so an already-issued, still-unexpired JWT '
  'grants nothing. Null means active. Written only by set_employee_active().';

-- Partial: the overwhelming majority of rows are active (null), and the only
-- queries that filter on this column look for the deactivated minority (the
-- employee directory's "Deactivated" tab).
create index users_deactivated_at_idx
  on public.users (deactivated_at)
  where deactivated_at is not null;
