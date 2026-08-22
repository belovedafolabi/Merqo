-- The shared recordAuditEvent() write path (docs/milestones/03-authentication-and-rbac-foundation.md
-- API/Backend Changes) — every mutation in every later milestone calls
-- lib/auth/audit.ts's recordAuditEvent(), which calls this RPC. This is
-- deliberately the ONLY insert path into audit_logs: no table-level INSERT
-- grant exists anywhere (see the per-table policy migrations), so a caller
-- cannot forge an audit row bypassing this function's shape, and — combined
-- with never granting UPDATE/DELETE on the table to any application role —
-- audit_logs is append-only enforced at the database level, not by
-- convention (this milestone's explicit Security Requirement).
--
-- Granted to anon as well as authenticated: a failed-login audit event is
-- recorded before any session exists.
create or replace function public.record_audit_event(
  p_organization_id uuid,
  p_user_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_id uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_ip_address inet default null,
  p_user_agent text default null
)
returns uuid
language sql
security definer
set search_path = public
as $$
  insert into public.audit_logs (
    organization_id, user_id, action, resource_type, resource_id,
    metadata, ip_address, user_agent
  )
  values (
    p_organization_id, p_user_id, p_action, p_resource_type, p_resource_id,
    p_metadata, p_ip_address, p_user_agent
  )
  returning id;
$$;

revoke execute on function public.record_audit_event(
  uuid, uuid, text, text, uuid, jsonb, inet, text
) from public;

grant execute on function public.record_audit_event(
  uuid, uuid, text, text, uuid, jsonb, inet, text
) to anon, authenticated;
