-- Branch-to-branch stock transfers (Decision #4, docs/milestones/
-- DECISIONS_AND_CONFLICTS.md §4 — "stock transfers move inventory between
-- branches", business-unit-to-business-unit transfers explicitly out of
-- MVP scope). `organization_id` is denormalized here (rather than derived
-- via a join every read) purely for RLS/query convenience, same shape as
-- product_variants.business_unit_id.
--
-- `status` is `text`, not an enum, and defaults to (and today only ever
-- holds) 'completed': this milestone implements the single-authorization,
-- atomic model — a transfer is verified/deducted/credited/recorded in one
-- DB transaction (execute_stock_transfer() in
-- 20260823110400_create_inventory_functions.sql), so a row only exists once
-- it has already fully succeeded; a failed attempt raises and the whole
-- transaction (including this insert) rolls back, leaving no partial row.
-- `text` over an enum keeps the door open for a future two-phase
-- initiate/receive model without a type migration (this milestone's own
-- Future Considerations).
create table public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  source_branch_id uuid not null references public.branches(id) on delete restrict,
  destination_branch_id uuid not null references public.branches(id) on delete restrict,
  status text not null default 'completed' check (status in ('completed')),

  created_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,

  check (source_branch_id <> destination_branch_id)
);

create index stock_transfers_organization_id_idx on public.stock_transfers (organization_id);
create index stock_transfers_source_branch_id_idx on public.stock_transfers (source_branch_id);
create index stock_transfers_destination_branch_id_idx on public.stock_transfers (destination_branch_id);

alter table public.stock_transfers enable row level security;

-- Two product references per line, not one shared product_id: Decision #3
-- (docs/milestones/DECISIONS_AND_CONFLICTS.md §3) fixes every product row to
-- exactly one Business Unit, which belongs to exactly one Branch — "each
-- branch's copy is its own row, its own price, its own stock." A single
-- product_id can therefore never hold a balance at any branch other than
-- its own Business Unit's branch, so a transfer necessarily debits one
-- product row at the source branch and credits a *different* product row
-- (the destination branch's own copy of "the same" real-world item) at the
-- destination. Decision #4's own resolution text confirms this reading
-- directly: crediting a different Business Unit at the same branch "is not
-- a transfer, since the pharmacy would need to carry that product as its
-- own distinct product record." The UI is responsible for letting the
-- operator pick the matching destination product (an SKU-match suggestion,
-- not a DB-enforced pairing).
create table public.stock_transfer_items (
  id uuid primary key default gen_random_uuid(),
  stock_transfer_id uuid not null references public.stock_transfers(id) on delete restrict,

  source_product_id uuid not null references public.products(id) on delete restrict,
  source_variant_id uuid references public.product_variants(id) on delete restrict,
  destination_product_id uuid not null references public.products(id) on delete restrict,
  destination_variant_id uuid references public.product_variants(id) on delete restrict,

  quantity numeric(14, 3) not null check (quantity > 0),

  created_at timestamptz not null default now()
);

create index stock_transfer_items_transfer_id_idx
  on public.stock_transfer_items (stock_transfer_id);

alter table public.stock_transfer_items enable row level security;
