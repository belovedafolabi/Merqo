-- The goods a layaway is against (docs/Customer Management_Store_Credit_and_
-- Layaway.md §23/§46), structurally identical to sale_items: a price
-- snapshot taken once, at creation, and never re-resolved afterwards.
--
-- These rows are also what create_layaway() reserves stock against and what
-- record_layaway_payment() converts into real SALE movements on completion
-- (20260823130700_create_customer_functions.sql) — reserving at creation is
-- the corpus's explicit architectural recommendation (§27–29: "Inventory is
-- reserved when the layaway is created", so a second customer cannot buy
-- goods a layaway customer has already part-paid for), and finally gives
-- inventory_balances.reserved_quantity the write path
-- 20260823110000_create_inventory_balances.sql anticipated.
create table public.layaway_items (
  id uuid primary key default gen_random_uuid(),
  layaway_id uuid not null references public.layaways(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid references public.product_variants(id) on delete restrict,

  quantity numeric(14, 3) not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  line_total numeric(14, 2) not null check (line_total >= 0)
);

create index layaway_items_layaway_id_idx on public.layaway_items (layaway_id);
create index layaway_items_product_id_idx on public.layaway_items (product_id);

alter table public.layaway_items enable row level security;
