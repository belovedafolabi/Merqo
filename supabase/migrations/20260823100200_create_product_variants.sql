-- A variant (e.g. size/color) shares its parent product's identity but has
-- its own SKU/barcode/stock identity (this milestone's Scope). `cost_price`/
-- `base_price` are nullable overrides — null means "inherit the parent
-- product's price," non-null means this variant's own price
-- (lib/products/pricing.ts resolves the fallback).
--
-- `business_unit_id` is denormalized from the parent product (kept in sync
-- by trg_product_variants_sync_business_unit_id below) rather than derived
-- via a join on every read — the same shape
-- business_unit_pos_config/business_unit_capabilities already use, and what
-- lets this table carry its own `UNIQUE(business_unit_id, sku)` per this
-- milestone's FR ("SKU and barcode are unique within a Business Unit").
-- Known MVP limitation: a variant's SKU is only checked for collisions
-- against other variants, not against `products.sku` directly (cross-table
-- uniqueness would need a shared registry table, out of scope for this
-- milestone's MVP simplicity).
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  business_unit_id uuid not null references public.business_units(id) on delete restrict,

  name text not null,
  sku text,
  barcode text,

  cost_price numeric(12, 2) check (cost_price is null or cost_price >= 0),
  base_price numeric(12, 2) check (base_price is null or base_price >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  archived_at timestamptz
);

create index product_variants_product_id_idx on public.product_variants (product_id);
create index product_variants_business_unit_id_idx on public.product_variants (business_unit_id);

create unique index product_variants_business_unit_sku_key
  on public.product_variants (business_unit_id, sku)
  where archived_at is null and sku is not null;
create unique index product_variants_business_unit_barcode_key
  on public.product_variants (business_unit_id, barcode)
  where archived_at is null and barcode is not null;

create trigger trg_product_variants_updated_at
  before update on public.product_variants
  for each row execute function public.set_updated_at();

-- Derives business_unit_id from the parent product rather than trusting
-- caller input, so it can never drift from products.business_unit_id (a
-- product's business unit is immutable after creation — no mutation in
-- lib/products/mutations.ts ever reassigns one, matching how
-- updateBusinessUnit() never reassigns a business unit's branch).
create or replace function public.sync_product_variant_business_unit_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select business_unit_id into new.business_unit_id
  from public.products
  where id = new.product_id;

  return new;
end;
$$;

create trigger trg_product_variants_sync_business_unit_id
  before insert or update of product_id on public.product_variants
  for each row execute function public.sync_product_variant_business_unit_id();

alter table public.product_variants enable row level security;
