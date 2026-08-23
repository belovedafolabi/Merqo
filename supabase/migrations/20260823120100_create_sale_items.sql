-- One row per cart line at time of sale. `unit_price` is the transaction-
-- time price snapshot this milestone's Scope calls for ("the sale item
-- stores the resolved price at time of sale... immune to later product price
-- changes") — resolved server-side via Milestone 06's resolveEffectivePrice()
-- before create_sale() is ever called, never read live from `products` again
-- after this row is written. Same append-only grant as `sales` — a sale
-- item is never edited; a return references it instead
-- (return_items.sale_item_id below).
create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid references public.product_variants(id) on delete restrict,

  quantity numeric(14, 3) not null check (quantity > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  line_discount numeric(14, 2) not null default 0 check (line_discount >= 0),
  line_total numeric(14, 2) not null check (line_total >= 0),

  created_at timestamptz not null default now()
);

create index sale_items_sale_id_idx on public.sale_items (sale_id);
create index sale_items_product_id_idx on public.sale_items (product_id);

alter table public.sale_items enable row level security;
