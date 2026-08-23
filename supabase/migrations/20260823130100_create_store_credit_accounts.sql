-- The cached store-credit balance — and, more importantly, the row that
-- gets locked FOR UPDATE to make the overdraw check race-free.
--
-- This milestone's Technical Requirements allow a cached summary "only if
-- it's provably kept in sync transactionally with every ledger insert", and
-- its Risks section names ledger-balance drift as the main technical risk.
-- The mechanism that guarantees both is the exact one Milestone 07 already
-- proved for stock: inventory_balances (cached) + inventory_movements
-- (ledger), written only by record_inventory_movement()
-- (20260823110400_create_inventory_functions.sql), which locks the balance
-- row, derives the new value, and writes both in one transaction. Here that
-- role is played by store_credit_accounts + store_credit_ledger, written
-- only by record_store_credit_entry()
-- (20260823130700_create_customer_functions.sql).
--
-- `balance` is therefore never the source of truth — the ledger is (this
-- milestone's Functional Requirements: "Store-credit balance is always
-- derived by summing ledger entries"). It exists because a checkout must be
-- able to lock *something* to serialize two concurrent spends, and because
-- summing an unbounded ledger on every POS keystroke is the wrong read
-- shape. tests/integration/customers.test.ts asserts the two never diverge.
--
-- One account per customer (UNIQUE) rather than per (customer, branch):
-- store credit follows the customer, and customers are business-wide
-- (20260823130000_create_customers.sql). A customer earning credit from a
-- refund at one branch can spend it at another — the whole point of a
-- business-wide customer record.
create table public.store_credit_accounts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references public.customers(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,

  balance numeric(14, 2) not null default 0 check (balance >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index store_credit_accounts_organization_id_idx
  on public.store_credit_accounts (organization_id);

create trigger trg_store_credit_accounts_updated_at
  before update on public.store_credit_accounts
  for each row execute function public.set_updated_at();

alter table public.store_credit_accounts enable row level security;
