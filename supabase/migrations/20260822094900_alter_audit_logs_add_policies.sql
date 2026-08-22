-- Deliberately SELECT-only: there is no INSERT/UPDATE/DELETE policy here,
-- and none should ever be added. Writes go exclusively through
-- record_audit_event() (20260822093500_create_audit_functions.sql), which
-- runs as the table owner and bypasses RLS — the only way into this table.
-- Combined with the database owning that as the sole write path (no
-- application role has table-level INSERT/UPDATE/DELETE grants), this is
-- what makes audit_logs append-only at the database level, not by
-- convention (this milestone's explicit Security Requirement and Acceptance
-- Criteria).
create policy audit_logs_select on public.audit_logs
  for select
  using (
    organization_id is not null
    and public.user_has_org_access(organization_id)
    and public.user_has_permission('audit_logs.view', organization_id)
  );
