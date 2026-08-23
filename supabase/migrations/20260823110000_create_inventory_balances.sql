-- Milestone 07's central table (docs/milestones/07-inventory-and-stock-
-- management.md Scope/Database Changes): the materialized/derived
-- current-stock view, "always reconcilable against the movement ledger"
-- (this milestone's Technical Requirements) — inventory_movements below is
-- the true source of truth; this table exists purely so a balance lookup
-- doesn't have to sum the entire movement history on every read.
--
-- Keyed to `branch_id` (Decision #2, docs/milestones/
-- DECISIONS_AND_CONFLICTS.md §2 — inventory belongs to the Branch, not the
-- Business Unit), with `business_unit_id` retained for attribution/
-- reporting only, mirroring how products.business_unit_id is the owning
-- reference elsewhere. `variant_id` is nullable exactly like
-- branch_price_overrides/product_prices' own product-vs-variant shape.
--
-- `unique nulls not distinct` (PG17, supabase/config.toml major_version =
-- 17) rather than a plain unique index: a plain unique index treats every
-- NULL variant_id as distinct, which would let a non-variant product accrue
-- more than one balance row per branch — the opposite of "one balance per
-- (branch, product/variant)" this table exists to guarantee.
--
-- `reserved_quantity` is schema-ready for Milestone 08's checkout-time
-- stock reservation, but no mutation path in this milestone ever writes a
-- nonzero value to it — see record_inventory_movement() in
-- 20260823110400_create_inventory_functions.sql, which only ever touches
-- `quantity`. `available_quantity` is a generated column (quantity -
-- reserved_quantity) so every caller reads the same derived value instead
-- of re-deriving the subtraction per call site.
create table public.inventory_balances (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid references public.product_variants(id) on delete restrict,

  quantity numeric(14, 3) not null default 0 check (quantity >= 0),
  reserved_quantity numeric(14, 3) not null default 0 check (reserved_quantity >= 0),
  available_quantity numeric(14, 3) generated always as (quantity - reserved_quantity) stored,
  low_stock_threshold numeric(14, 3) check (low_stock_threshold is null or low_stock_threshold >= 0),

  updated_at timestamptz not null default now(),

  unique nulls not distinct (branch_id, product_id, variant_id)
);

create index inventory_balances_branch_id_idx on public.inventory_balances (branch_id);
create index inventory_balances_product_id_idx on public.inventory_balances (product_id);

create trigger trg_inventory_balances_updated_at
  before update on public.inventory_balances
  for each row execute function public.set_updated_at();

alter table public.inventory_balances enable row level security;
