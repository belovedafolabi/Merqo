-- A Business Unit's actual enabled capabilities. Seeded from its Business
-- Type's defaults (business_type_capabilities) at creation time, then
-- independently overridable per docs/TAS.md §8.
create table public.business_unit_capabilities (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  capability_id uuid not null references public.capabilities(id) on delete cascade,
  enabled boolean not null default false,
  is_override boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null
);

create unique index business_unit_capabilities_unique
  on public.business_unit_capabilities (business_unit_id, capability_id);

create trigger trg_business_unit_capabilities_updated_at
  before update on public.business_unit_capabilities
  for each row execute function public.set_updated_at();

alter table public.business_unit_capabilities enable row level security;

-- ---------------------------------------------------------------------------
-- Auto-seed a new Business Unit's capabilities from its Business Type's
-- defaults. This logic must live in the database (as a trigger) rather than
-- application code because Milestone 05 (the first milestone with Server
-- Actions for creating Business Units) doesn't exist yet, and this
-- milestone's own acceptance criteria require seeding to already be true and
-- testable. Confirmed as the intended approach for this milestone.
-- ---------------------------------------------------------------------------
create or replace function public.seed_business_unit_capabilities()
returns trigger
language plpgsql
as $$
begin
  insert into public.business_unit_capabilities
    (business_unit_id, capability_id, enabled, is_override, created_by)
  select new.id, btc.capability_id, btc.default_enabled, false, new.created_by
  from public.business_type_capabilities btc
  where btc.business_type_id = new.business_type_id;
  return new;
end;
$$;

create trigger trg_business_units_seed_capabilities
  after insert on public.business_units
  for each row execute function public.seed_business_unit_capabilities();
