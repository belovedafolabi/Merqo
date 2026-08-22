-- Join table: which Roles a User holds. Skeleton only — no scope columns yet
-- (Milestone 03 adds organization_id/branch_id/business_unit_id scope per
-- its own Database Changes, e.g. "Branch Manager @ Abuja Branch" per
-- docs/TAS.md §24). NOTE: once those scope columns land, the uniqueness
-- constraint below must be redefined to include scope — a user can
-- legitimately hold the same role at two different scopes.
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  -- RESTRICT: deleting a role still assigned to users must fail loudly, not
  -- silently strip the assignment (which CASCADE would do).
  role_id uuid not null references public.roles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null
);

create index user_roles_user_id_idx on public.user_roles (user_id);
create unique index user_roles_unique on public.user_roles (user_id, role_id);

create trigger trg_user_roles_updated_at
  before update on public.user_roles
  for each row execute function public.set_updated_at();

alter table public.user_roles enable row level security;
