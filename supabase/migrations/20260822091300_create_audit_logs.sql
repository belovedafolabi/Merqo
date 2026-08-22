-- Append-only audit trail skeleton (Milestone 02 scope: structure only — the
-- shared recordAuditEvent() write path and the first real events are
-- Milestone 03's scope). Columns per docs/TAS.md §26.
--
-- Deliberate deviation from the standard audit-column convention: no
-- `updated_at` (an audit row is never updated — Milestone 03 enforces this at
-- the grant level) and no `created_by` (redundant with `user_id`, which is
-- already the actor). See docs/architecture/database-conventions.md.
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index audit_logs_organization_id_idx on public.audit_logs (organization_id);
create index audit_logs_user_id_idx on public.audit_logs (user_id);
create index audit_logs_resource_idx on public.audit_logs (resource_type, resource_id);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);

alter table public.audit_logs enable row level security;
