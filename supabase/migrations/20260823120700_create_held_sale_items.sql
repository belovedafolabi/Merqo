-- Cart line snapshot for a held sale — `on delete cascade` (unlike every
-- append-only table above) is deliberate: discarding a held sale should
-- take its draft lines with it, since neither carries any historical
-- significance once the hold itself is gone.
create table public.held_sale_items (
  id uuid primary key default gen_random_uuid(),
  held_sale_id uuid not null references public.held_sales(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid references public.product_variants(id) on delete restrict,

  quantity numeric(14, 3) not null check (quantity > 0),

  created_at timestamptz not null default now()
);

create index held_sale_items_held_sale_id_idx on public.held_sale_items (held_sale_id);

alter table public.held_sale_items enable row level security;
