-- Batch/expiry tracking (docs/milestones/07-inventory-and-stock-
-- management.md Scope: "used by, but not exclusive to, pharmacy-type
-- business units — modeled as a general capability per Milestone 02's
-- capability engine, not a pharmacy-specific hard-coded feature"). Gating
-- is entirely the existing `batch_tracking`/`expiry_tracking`
-- business_unit_capabilities rows seeded in supabase/seed.sql — no new
-- capability rows needed, no per-product flag on `products` either
-- (whether batch/expiry fields render is a Business-Unit-wide decision, the
-- same way products.view_cost_price gates a field per-user, not per-row).
--
-- Deliberately an informational record attached alongside a movement
-- (lib/inventory/mutations.ts's createStockAdjustment()), not a second
-- ledger reconciled against inventory_balances.quantity — no Functional
-- Requirement in this milestone asks for FIFO consumption/depletion across
-- batches, only that "batch/expiry data can be attached to inventory
-- records where the relevant capability is enabled."
create table public.batches (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid references public.product_variants(id) on delete restrict,

  batch_number text not null,
  expiry_date date,
  quantity numeric(14, 3) not null default 0 check (quantity >= 0),

  created_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null
);

create index batches_branch_product_idx on public.batches (branch_id, product_id);
create index batches_expiry_date_idx on public.batches (expiry_date) where expiry_date is not null;

alter table public.batches enable row level security;
