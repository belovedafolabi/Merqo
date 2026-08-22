-- Curated capability catalog (per docs/milestones/02-database-and-core-domain-foundation.md
-- Scope: products, inventory, batch_tracking, expiry_tracking, service_charge,
-- layaway, store_credit — deliberately NOT an open-ended plugin registry.
-- New capabilities are added here as later milestones introduce real
-- toggleable behavior, never speculatively.
create table public.capabilities (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null
);

create unique index capabilities_key_key on public.capabilities (key);

create trigger trg_capabilities_updated_at
  before update on public.capabilities
  for each row execute function public.set_updated_at();

alter table public.capabilities enable row level security;
