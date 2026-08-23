-- A layaway is explicitly NOT a sale (docs/Customer Management_Store_Credit_
-- and_Layaway.md §22: "The system should not record the product as a
-- completed sale immediately when the customer only makes a deposit") —
-- which is why this is its own table rather than a `sales` row with a
-- status, and why no `sales`/`sale_items`/`payments` rows exist for a
-- layaway until it is fully paid.
--
-- `total_amount` is a price snapshot taken at creation (layaway_items
-- carries the per-line detail), the same transaction-time snapshot boundary
-- `sale_items` establishes: a later branch price change never moves an
-- agreed layaway total.
--
-- `amount_paid` is a cached summary of layaway_payments, and carries exactly
-- the same contract store_credit_accounts.balance does — the ledger
-- (layaway_payments) is the source of truth, this column is only ever
-- written inside record_layaway_payment() in the same transaction as the
-- payment insert (20260823130700_create_customer_functions.sql). Outstanding
-- balance is deliberately NOT a stored column: it is `total_amount -
-- amount_paid`, one subtraction, and a third denormalized number would be a
-- third thing that can drift (contrast inventory_balances.available_quantity,
-- which is a generated column precisely so it cannot).
--
-- `status` is `text` with a CHECK, not an enum — same reasoning as
-- sales.status/stock_transfers.status. The corpus (§25) lists six eventual
-- statuses (PENDING/ACTIVE/PAID/CANCELLED/EXPIRED/REFUNDED); only the three
-- this milestone's Functional Requirements actually exercise are allowed
-- here. 'expired' needs configurable expiration rules the corpus itself
-- defers ("The exact expiration rules can be configured later"), and
-- 'refunded' needs a layaway-refund flow no requirement in this milestone
-- asks for — both are additive CHECK changes when a milestone needs them.
create table public.layaways (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  business_unit_id uuid not null references public.business_units(id) on delete restrict,

  reference text not null,

  total_amount numeric(14, 2) not null check (total_amount > 0),
  amount_paid numeric(14, 2) not null default 0 check (amount_paid >= 0),

  status text not null default 'active' check (status in ('active', 'paid', 'cancelled')),

  cancellation_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  completed_at timestamptz,
  cancelled_at timestamptz,

  -- A layaway can never be over-paid; record_layaway_payment() rejects the
  -- attempt with a clear message before this constraint would ever fire, so
  -- this is the last line of defense, not the first (lib/customers/
  -- schemas.ts's own module doc describes the same layering).
  constraint layaways_amount_paid_within_total_check check (amount_paid <= total_amount)
);

create unique index layaways_organization_reference_key
  on public.layaways (organization_id, reference);
create index layaways_customer_id_idx on public.layaways (customer_id, created_at desc);
create index layaways_branch_id_idx on public.layaways (branch_id, created_at desc);
create index layaways_status_idx on public.layaways (status) where status = 'active';

create trigger trg_layaways_updated_at
  before update on public.layaways
  for each row execute function public.set_updated_at();

alter table public.layaways enable row level security;
