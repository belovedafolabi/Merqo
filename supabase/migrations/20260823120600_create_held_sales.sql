-- A held/parked cart, not a sale — this milestone's Scope calls for
-- "hold/resume sale" as a POS shell feature distinct from the immutable
-- `sales` chain above. Nothing here ever touches inventory or produces an
-- audit event on its own: holding is just deferring an in-progress cart, and
-- resuming loads it back into the client cart before the normal
-- create_sale() path runs. Ordinary mutable table (insert/select/delete) —
-- none of the append-only reasoning above applies, since a held sale has no
-- financial or audit significance until it becomes a real sale.
create table public.held_sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  business_unit_id uuid not null references public.business_units(id) on delete restrict,

  label text,

  created_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null
);

create index held_sales_branch_id_idx on public.held_sales (branch_id, created_at desc);

alter table public.held_sales enable row level security;
