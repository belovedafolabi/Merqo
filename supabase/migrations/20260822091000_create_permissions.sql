-- Skeleton permission catalog (Milestone 02 scope: structure only, no seed
-- rows — populated in Milestone 03). `key` is the canonical `resource.action`
-- identifier (e.g. "products.create") per docs/TAS.md §25 / docs/PRD.md §12.
create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  resource text not null,
  action text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null
);

create unique index permissions_key_key on public.permissions (key);

create trigger trg_permissions_updated_at
  before update on public.permissions
  for each row execute function public.set_updated_at();

alter table public.permissions enable row level security;
