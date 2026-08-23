-- References the original sale_item, not a raw product_id — create_return()
-- checks the requested quantity against that sale item's own quantity minus
-- whatever has already been returned against it, so the same line can never
-- be over-returned across multiple separate return transactions.
create table public.return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.returns(id) on delete restrict,
  sale_item_id uuid not null references public.sale_items(id) on delete restrict,

  quantity numeric(14, 3) not null check (quantity > 0),
  reason text,

  created_at timestamptz not null default now()
);

create index return_items_return_id_idx on public.return_items (return_id);
create index return_items_sale_item_id_idx on public.return_items (sale_item_id);

alter table public.return_items enable row level security;
