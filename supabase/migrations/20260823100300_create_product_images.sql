-- Per docs/Database Architecture_PostgreSQL_Schema.md §22 and this
-- milestone's Scope ("images via Supabase Storage"). `storage_path` is the
-- key inside the `product-images` Storage bucket
-- (20260823101300_create_product_images_storage_bucket.sql), organized per
-- docs/TAS.md §35's `organizations/{organization_id}/products/` convention
-- — this table just indexes/orders those objects, it doesn't duplicate
-- their bytes.
--
-- `on delete cascade`: an image row has no independent meaning once its
-- product is gone (docs/architecture/database-conventions.md's "pure
-- config/mapping" CASCADE category) — unlike products.business_unit_id,
-- which points *up* the operational hierarchy and uses RESTRICT.
create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null,
  alt_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null
);

create index product_images_product_id_idx on public.product_images (product_id, sort_order);

alter table public.product_images enable row level security;
