-- The layaway installment ledger (docs/TAS.md §22, docs/Customer
-- Management_Store_Credit_and_Layaway.md §24: "Every installment becomes an
-- immutable payment record"). Same append-only shape as
-- store_credit_ledger: no UPDATE/DELETE grant for `authenticated`, sole
-- write path is record_layaway_payment() (SECURITY DEFINER). This milestone's
-- Functional Requirements state the correction rule outright — "correcting a
-- mistaken payment happens via a new ledger entry, never an edit to the
-- original."
--
-- `balance_after` mirrors store_credit_ledger.balance_after /
-- inventory_movements.quantity_after: the cumulative amount paid at the
-- moment this installment landed, making drift between this ledger and
-- layaways.amount_paid detectable rather than silent.
--
-- Payment methods deliberately exclude 'store_credit', unlike `payments`
-- and `refunds`. Nothing in this milestone's Scope asks for it, and allowing
-- it would mean a layaway installment silently drawing down the
-- store-credit ledger — a second, non-obvious spend path competing with
-- checkout's. If a requirement for it appears, it is an additive CHECK
-- change plus a record_store_credit_entry() call in record_layaway_payment(),
-- with no restructuring here.
create table public.layaway_payments (
  id uuid primary key default gen_random_uuid(),
  layaway_id uuid not null references public.layaways(id) on delete restrict,

  amount numeric(14, 2) not null check (amount > 0),
  balance_after numeric(14, 2) not null check (balance_after >= 0),
  method text not null check (method in ('cash', 'card', 'transfer')),
  reference text,

  created_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null
);

create index layaway_payments_layaway_id_idx
  on public.layaway_payments (layaway_id, created_at desc);

alter table public.layaway_payments enable row level security;
