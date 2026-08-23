-- Milestone 06's central table (docs/milestones/06-product-catalog-and-
-- pricing.md Scope/Database Changes), implementing the forward-looking
-- constraint intent already documented in
-- 20260822090600_create_business_units.sql and
-- docs/architecture/database-conventions.md's "Forward-looking constraint
-- intents": `business_unit_id NOT NULL` with `UNIQUE(business_unit_id, sku)`
-- and `UNIQUE(business_unit_id, barcode)` (Decision #3 — a product belongs
-- to exactly one Business Unit, scoped within its branch).
--
-- Deliberately omits `product_type` (an undefined ENUM that appears once in
-- `docs/Database Architecture_PostgreSQL_Schema.md` §19 with no values
-- specified anywhere in the corpus, and isn't in this milestone's Scope/
-- Functional Requirements) and the inventory-flavored
-- `track_inventory`/`track_batches`/`track_expiry` flags (explicitly
-- Milestone 07's concern per this milestone's Out of Scope) — both can be
-- added as an additive `alter_products_*` migration when a later milestone
-- has a concrete need, matching how Milestone 05 added
-- `business_unit_pos_config` onto the already-shipped `business_units`.
--
-- `archived_at` (not `is_active`), per docs/architecture/database-
-- conventions.md: products are tenant/operational data with a lifecycle
-- to preserve for historical sale references (this milestone's own FR),
-- the same category `business_units`/`branches` already use.
create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  category_id uuid references public.categories(id) on delete set null,

  name text not null,
  description text,
  sku text not null,
  barcode text,
  unit_of_measurement text not null default 'unit',

  cost_price numeric(12, 2) not null default 0 check (cost_price >= 0),
  base_price numeric(12, 2) not null default 0 check (base_price >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  archived_at timestamptz
);

create index products_business_unit_id_idx on public.products (business_unit_id);
create index products_category_id_idx on public.products (category_id);

-- Partial-unique (archived_at convention) — an archived product's SKU/
-- barcode can be reused by a new one; `barcode` is nullable so multiple
-- products with no barcode set are unaffected (a NULL never conflicts with
-- another NULL in a unique index).
create unique index products_business_unit_sku_key
  on public.products (business_unit_id, sku) where archived_at is null;
create unique index products_business_unit_barcode_key
  on public.products (business_unit_id, barcode) where archived_at is null and barcode is not null;

create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

alter table public.products enable row level security;
