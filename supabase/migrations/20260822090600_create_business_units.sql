-- A Business Unit belongs to exactly one Branch and references exactly one
-- Business Type (the single NOT NULL FK below is what makes that a
-- database-enforced fact, not just a convention).
create table public.business_units (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  business_type_id uuid not null references public.business_types(id) on delete restrict,
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  archived_at timestamptz
);

create index business_units_branch_id_idx on public.business_units (branch_id);
create index business_units_business_type_id_idx on public.business_units (business_type_id);
create unique index business_units_branch_slug_key on public.business_units (branch_id, slug) where archived_at is null;

create trigger trg_business_units_updated_at
  before update on public.business_units
  for each row execute function public.set_updated_at();

alter table public.business_units enable row level security;

-- ---------------------------------------------------------------------------
-- Forward-looking constraint intent (documented here, enforced when those
-- tables are actually created — see docs/milestones/DECISIONS_AND_CONFLICTS.md
-- #2 and #3, and docs/architecture/database-conventions.md):
--
--   * Inventory (Milestone 06/07) is keyed to `branch_id`, NOT
--     `business_unit_id` — inventory is a single shared stock pool per
--     branch; a Business Unit is attribution/permission context only, never
--     an isolated stock owner (Decision #2).
--
--   * Products (Milestone 06) will require `business_unit_id NOT NULL` with
--     `UNIQUE(business_unit_id, sku)` and `UNIQUE(business_unit_id, barcode)`
--     — a product belongs to exactly one Business Unit, scoped within its
--     branch (Decision #3).
--
-- This table intentionally carries no stock/product columns of its own.
-- ---------------------------------------------------------------------------
