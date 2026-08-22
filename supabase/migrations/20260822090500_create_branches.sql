-- A Branch belongs to exactly one Organization. An Organization can have many.
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  archived_at timestamptz
);

create index branches_organization_id_idx on public.branches (organization_id);
create unique index branches_org_slug_key on public.branches (organization_id, slug) where archived_at is null;

create trigger trg_branches_updated_at
  before update on public.branches
  for each row execute function public.set_updated_at();

alter table public.branches enable row level security;
