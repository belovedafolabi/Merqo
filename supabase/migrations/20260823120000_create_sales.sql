-- Milestone 08's central table (docs/milestones/08-pos-transaction-engine.md
-- Database Changes): a completed sale. `status` is `text`, not an enum, and
-- defaults to (and today only ever holds) 'completed' — same reasoning as
-- stock_transfers.status: a row only exists once create_sale()
-- (20260823120800_create_sales_functions.sql) has already fully validated,
-- priced, and deducted stock for it in one DB transaction; a failed attempt
-- raises and the whole insert rolls back, leaving no partial row. `text`
-- keeps the door open for a future 'voided'/'disputed' status without a type
-- migration, matching stock_transfers' own Future Considerations reasoning.
--
-- No `payment_method`/`amount` columns here — `payments` below is a
-- deliberately distinct table (this milestone's own Future Considerations:
-- "the payment-recording schema should not need a structural rewrite" to add
-- split/multiple payments later, since payments already isn't folded into
-- sales).
--
-- `idempotency_key` is `not null unique` (this milestone's Technical
-- Requirements: "a client-supplied idempotency key stored against completed
-- sales, checked before creating a new one") — create_sale() does the actual
-- check-and-insert atomically via `on conflict (idempotency_key) do nothing`,
-- not a separate SELECT-then-INSERT race.
--
-- Append-only from the application's perspective (this milestone's own
-- Database Changes: "no UPDATE/DELETE grants on completed sale rows") — see
-- 20260823121700_alter_tables_grant_authenticated_sales.sql; corrections
-- happen via return/refund rows referencing this one, never by editing it.
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  business_unit_id uuid not null references public.business_units(id) on delete restrict,

  idempotency_key text not null,

  subtotal numeric(14, 2) not null check (subtotal >= 0),
  discount_amount numeric(14, 2) not null default 0 check (discount_amount >= 0),
  discount_reason text,
  tax_amount numeric(14, 2) not null default 0 check (tax_amount >= 0),
  service_charge_amount numeric(14, 2) not null default 0 check (service_charge_amount >= 0),
  total numeric(14, 2) not null check (total >= 0),

  status text not null default 'completed' check (status in ('completed')),

  created_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null
);

create unique index sales_idempotency_key_key on public.sales (idempotency_key);
create index sales_organization_id_idx on public.sales (organization_id);
create index sales_branch_id_idx on public.sales (branch_id, created_at desc);

alter table public.sales enable row level security;
