-- Append-only movement ledger (docs/milestones/07-inventory-and-stock-
-- management.md Scope: "append-only record of every stock change... never
-- mutate a quantity without recording why", docs/TAS.md §13-14). The single
-- insert path is record_inventory_movement()
-- (20260823110400_create_inventory_functions.sql) — no application role is
-- ever granted direct INSERT/UPDATE/DELETE on this table (see
-- 20260823110600_alter_inventory_movements_add_policies.sql and
-- 20260823110800_alter_tables_grant_authenticated_inventory.sql), the same
-- append-only shape as audit_logs and product_prices.
--
-- `quantity_after` is a balance snapshot at the moment of this movement —
-- not derivable from quantity_delta alone — so the Definition of Done's
-- "inventory_balances can be fully reconstructed from inventory_movements
-- alone" can be verified directly against this column, and so a movement
-- row is independently meaningful even read out of order.
--
-- `reason` is required for ADJUSTMENT movements only (this milestone's FR:
-- "Stock adjustments require a reason and are auditable") — SALE/RETURN/
-- TRANSFER_* movements carry their own reference_type/reference_id instead.
create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid references public.product_variants(id) on delete restrict,

  movement_type text not null
    check (movement_type in ('SALE', 'RETURN', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN')),
  quantity_delta numeric(14, 3) not null check (quantity_delta <> 0),
  quantity_after numeric(14, 3) not null check (quantity_after >= 0),

  reason text check (movement_type <> 'ADJUSTMENT' or reason is not null),
  reference_type text,
  reference_id uuid,

  created_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null
);

create index inventory_movements_branch_product_idx
  on public.inventory_movements (branch_id, product_id, created_at desc);
create index inventory_movements_reference_idx
  on public.inventory_movements (reference_type, reference_id) where reference_id is not null;

alter table public.inventory_movements enable row level security;
