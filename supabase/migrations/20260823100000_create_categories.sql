-- Milestone 06 (docs/milestones/06-product-catalog-and-pricing.md Scope):
-- "Category management (simple, hierarchical or flat — flat is sufficient
-- for MVP; avoid over-building a nested-category system unless a concrete
-- need emerges)." Deliberately no `parent_id` — this milestone's own
-- Implementation Notes warn against building nested categories ahead of a
-- real need, mirroring Milestone 02's rejection of a generic EAV settings
-- engine (docs/architecture/database-conventions.md).
--
-- Scoped to `business_unit_id`, not `organization_id`: a category ("Drinks",
-- "Snacks") is meaningful within one Business Unit's own catalog, matching
-- `products.business_unit_id` below (Decision #3).
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  archived_at timestamptz
);

create index categories_business_unit_id_idx on public.categories (business_unit_id);
-- Partial-unique per docs/architecture/database-conventions.md's archived_at
-- convention: an archived category's name can be reused by a new one.
create unique index categories_business_unit_name_key
  on public.categories (business_unit_id, name) where archived_at is null;

create trigger trg_categories_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

alter table public.categories enable row level security;
