-- Skeleton role catalog (Milestone 02 scope: structure only, no seed rows —
-- default role catalog seeding is Milestone 03's Database Changes).
--
-- Deliberately no scope columns (organization_id / branch_id /
-- business_unit_id): Milestone 03's own doc claims that schema design as its
-- scope. Do not add scope columns here.
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  is_system_role boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null
);

create unique index roles_slug_key on public.roles (slug);

create trigger trg_roles_updated_at
  before update on public.roles
  for each row execute function public.set_updated_at();

alter table public.roles enable row level security;
