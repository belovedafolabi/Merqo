-- Append-only price-change history (this milestone's FR: "Price changes are
-- recorded in a price-history table; the current effective price is always
-- derivable, and past prices remain queryable for reporting/auditing").
--
-- Mirrors `audit_logs`' append-only shape (no `updated_at`) but is a typed,
-- domain-specific table rather than a generic audit-log entry — this is
-- what Milestone 10's reporting reads for "price at a given point in time,"
-- not something to reconstruct from audit_logs' free-form `metadata` jsonb.
--
-- `branch_id null` = a base-price change (`products.base_price`); a
-- non-null `branch_id` = a branch-override change
-- (`branch_price_overrides.price` for that product/branch). Every write to
-- either live column happens in the same mutation call that inserts the
-- matching history row here (lib/products/mutations.ts) — this table is
-- never written to standalone and never updated/deleted once written.
create table public.product_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  price numeric(12, 2) not null check (price >= 0),
  changed_by uuid references public.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index product_prices_product_id_idx on public.product_prices (product_id, changed_at desc);
create index product_prices_branch_id_idx on public.product_prices (branch_id);

alter table public.product_prices enable row level security;
