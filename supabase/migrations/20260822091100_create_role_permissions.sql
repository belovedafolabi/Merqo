-- Join table: which Permissions a Role grants. Skeleton only — no seed rows
-- (Milestone 03 populates alongside its role/permission catalog).
create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null
);

create unique index role_permissions_unique on public.role_permissions (role_id, permission_id);

create trigger trg_role_permissions_updated_at
  before update on public.role_permissions
  for each row execute function public.set_updated_at();

alter table public.role_permissions enable row level security;
