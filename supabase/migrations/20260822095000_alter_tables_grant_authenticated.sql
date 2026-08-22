-- Postgres requires a table-level GRANT before RLS is even consulted — RLS
-- filters *rows* a role is otherwise permitted to touch, it doesn't grant
-- the ability to touch the table at all. This migration is what actually
-- makes the policies authored in the alter_*_add_policies.sql migrations
-- reachable by the `authenticated` role via PostgREST/supabase-js; without
-- it every query from a real signed-in user fails with "permission denied
-- for table ..." (42501) regardless of how correct the RLS policy is.
--
-- Grants mirror exactly the operations each table's own policies support —
-- see the matching alter_<table>_add_policies.sql migration for the
-- authorization logic. `anon` deliberately receives no table-level grants
-- at all on tenant/RBAC tables (only EXECUTE on the specific pre-session
-- RPCs — login throttle, audit event): an unauthenticated caller has no
-- legitimate reason to touch these tables directly, so "permission denied"
-- is the correct, not merely incidental, outcome for `anon`.
grant select, update on public.organizations to authenticated;
grant select, insert, update on public.branches to authenticated;
grant select, insert, update on public.business_units to authenticated;
grant select on public.business_types to authenticated;
grant select on public.capabilities to authenticated;
grant select on public.business_type_capabilities to authenticated;
grant select on public.business_unit_capabilities to authenticated;
grant select, update on public.users to authenticated;
grant select on public.roles to authenticated;
grant select on public.permissions to authenticated;
grant select on public.role_permissions to authenticated;
grant select, insert, update, delete on public.user_roles to authenticated;
grant select on public.audit_logs to authenticated;
-- No grant on login_attempts for any role — reachable only through the
-- SECURITY DEFINER check_login_throttle()/record_login_attempt() functions.
