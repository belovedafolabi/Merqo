-- Branch-level pricing override (this milestone's Scope, docs/Product_Catalog_
-- and_Pricing_Architecture.md §20.4). Because a product belongs to exactly
-- one Business Unit which belongs to exactly one Branch (Decision #3), only
-- one row here is ever relevant to a given product today — this is
-- deliberately forward-compatible plumbing shaped exactly for
-- `resolveEffectivePrice(productId, branchId)` (lib/products/pricing.ts),
-- not speculative overbuilding: `UNIQUE(product_id, branch_id)` is the
-- precise shape that function's lookup needs.
--
-- No `archived_at` — an override is either the current price for that
-- (product, branch) pair or it doesn't exist; superseding it means deleting
-- the row (the *history* of what it used to be lives in `product_prices`,
-- never in a soft-deleted override row).
create table public.branch_price_overrides (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  price numeric(12, 2) not null check (price >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null
);

create unique index branch_price_overrides_product_branch_key
  on public.branch_price_overrides (product_id, branch_id);
create index branch_price_overrides_branch_id_idx on public.branch_price_overrides (branch_id);

create trigger trg_branch_price_overrides_updated_at
  before update on public.branch_price_overrides
  for each row execute function public.set_updated_at();

alter table public.branch_price_overrides enable row level security;
