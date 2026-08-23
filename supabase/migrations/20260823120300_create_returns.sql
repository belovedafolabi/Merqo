-- A return always references an original sale (this milestone's FR: "A
-- return references its original sale and correctly reverses the relevant
-- inventory quantity") — never a standalone record. `organization_id`/
-- `branch_id` are denormalized from the referenced sale purely for RLS/query
-- convenience, same shape as stock_transfers.organization_id; create_return()
-- (20260823120800_create_sales_functions.sql) derives and writes both from
-- the sale row itself, never from a caller-supplied value, mirroring
-- record_inventory_movement()'s own "derive, don't trust" precedent for
-- business_unit_id.
create table public.returns (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,

  reason text not null,

  created_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null
);

create index returns_sale_id_idx on public.returns (sale_id);
create index returns_branch_id_idx on public.returns (branch_id, created_at desc);

alter table public.returns enable row level security;
