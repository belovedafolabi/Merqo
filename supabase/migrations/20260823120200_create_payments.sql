-- Exactly one row per sale today (no split payments — explicitly excluded
-- from MVP per docs/PRD.md §17), but modeled as its own table rather than
-- columns on `sales` specifically so a later split-payment feature is an
-- additional row here, not a schema rewrite (this milestone's own Future
-- Considerations). `store_credit` deducts from an existing balance only —
-- the ledger that maintains that balance is Milestone 09's; this table just
-- needs the method to be a legal option at checkout (this milestone's
-- Implementation Notes).
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,

  method text not null check (method in ('cash', 'card', 'transfer', 'store_credit')),
  amount numeric(14, 2) not null check (amount > 0),
  reference text,

  created_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null
);

create index payments_sale_id_idx on public.payments (sale_id);

alter table public.payments enable row level security;
