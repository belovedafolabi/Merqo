-- A Business Type is a configuration template, never a hard-coded behavior
-- branch in application code (no `if (businessType === 'restaurant')`
-- anywhere — capability flags are the only signal, see
-- business_type_capabilities / business_unit_capabilities below).
--
-- Deliberately a plain insertable table, not an enum or check-constrained
-- list: a Super Admin can add a 14th business type later (Milestone 13's
-- admin tooling) without a schema migration.
create table public.business_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  description text,
  -- Catalog/reference row toggle. Distinct from `archived_at` (soft-delete of
  -- operational data) used on Organizations/Branches/Business Units below —
  -- see docs/architecture/database-conventions.md.
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null
);

create unique index business_types_slug_key on public.business_types (slug);

create trigger trg_business_types_updated_at
  before update on public.business_types
  for each row execute function public.set_updated_at();

alter table public.business_types enable row level security;
