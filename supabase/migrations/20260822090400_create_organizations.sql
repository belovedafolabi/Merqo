-- An Organization is a platform client (single-tenant deployment root).
-- Soft-delete only — hard deletion of operational entities is excluded per
-- docs/Business_Structure_Branche.md §24.42.
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  archived_at timestamptz
);

-- Unique only among non-archived rows so a slug can be reused after archive.
create unique index organizations_slug_key on public.organizations (slug) where archived_at is null;

create trigger trg_organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

alter table public.organizations enable row level security;
