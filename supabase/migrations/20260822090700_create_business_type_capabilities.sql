-- Per-Business-Type default capability flags. This is the source of truth
-- that business_unit_capabilities (next migration) seeds new Business Units
-- from, and is what makes the acceptance criterion "a Business Unit's
-- capabilities are seeded from its Business Type's defaults" possible before
-- Milestone 05's Server Actions exist.
--
-- Modeled as an explicit typed join table (mirroring business_unit_capabilities)
-- rather than a JSON/array column on business_types or a generic settings
-- table, per the project's stated preference to avoid an EAV/settings engine
-- (docs/TAS.md §9) and to keep business_types schema-stable when a new type
-- is added.
create table public.business_type_capabilities (
  id uuid primary key default gen_random_uuid(),
  business_type_id uuid not null references public.business_types(id) on delete cascade,
  capability_id uuid not null references public.capabilities(id) on delete cascade,
  default_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null
);

create unique index business_type_capabilities_unique
  on public.business_type_capabilities (business_type_id, capability_id);

create trigger trg_business_type_capabilities_updated_at
  before update on public.business_type_capabilities
  for each row execute function public.set_updated_at();

alter table public.business_type_capabilities enable row level security;
