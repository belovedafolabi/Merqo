-- Saved custom-report configurations — docs/PRD.md §29's "saved
-- configurations" among the custom report builder's required features.
--
-- This does NOT violate Milestone 10's Definition of Done ("no new
-- denormalized/duplicated data table exists that could drift from the
-- transactional source of truth"). What is stored here is a *question*, never
-- an answer: which dataset, which dimensions, which filters. Every row's
-- results are computed fresh against `sales`/`sale_items`/`expenses` on each
-- run, so there is nothing here that can drift from anything.
--
-- SECURITY — the obvious attack on this design, stated plainly because the
-- mitigation lives in application code rather than in this DDL:
-- `config` is jsonb, which Postgres will not type-check for us. A row
-- hand-edited in the database, or written by a client that bypassed the
-- builder UI, could contain a dimension or metric token that is not on
-- lib/reports/registry.ts's whitelist. The guard is that lib/reports/saved.ts
-- re-parses `config` through the same customReportConfigSchema on *load*,
-- before it is ever executed — a stored config is treated as untrusted input
-- exactly like a fresh request body, never as pre-validated because it once
-- passed validation. Note also that run_custom_report()
-- (20260823141100) contains no dynamic SQL at all, so even a token that
-- somehow reached it can only miss every `case` branch and raise. The jsonb
-- column is the reason those two layers exist, not a hole in them.
--
-- `visibility` implements docs/Reporting_Analytics_and_Custom_Reports.md
-- §42's ownership scope (personal / branch / organization) as a three-value
-- enum rather than a share table: sharing a saved report is a property of the
-- report, and nothing in the design corpus asks for per-user share lists.
create table public.saved_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  business_unit_id uuid references public.business_units(id) on delete restrict,

  name text not null,
  description text,
  dataset text not null,
  config jsonb not null,
  visibility text not null default 'private'
    check (visibility in ('private', 'branch', 'organization')),

  archived_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null
);

-- Partial-unique scoped `where archived_at is null`, the standard soft-delete
-- pairing from docs/architecture/database-conventions.md: archiving a saved
-- report frees its name for reuse. Scoped per author rather than per
-- organization — two managers naming their own report "Monthly Sales" is
-- ordinary, not a conflict.
create unique index saved_reports_owner_name_key
  on public.saved_reports (created_by, name)
  where archived_at is null;

create index saved_reports_organization_id_idx on public.saved_reports (organization_id);

-- Unlike `expenses` above, this table IS updated in normal operation (rename,
-- retune, archive), so it carries `updated_at` and the shared trigger per the
-- standard convention.
create trigger trg_saved_reports_updated_at
  before update on public.saved_reports
  for each row
  execute function public.set_updated_at();

alter table public.saved_reports enable row level security;
