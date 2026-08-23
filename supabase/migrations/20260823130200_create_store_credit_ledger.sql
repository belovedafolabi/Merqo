-- The store-credit source of truth (docs/TAS.md §21, this milestone's
-- Functional Requirements: "Store-credit balance is always derived by
-- summing ledger entries, never stored/updated as a single mutable
-- number"). Append-only in exactly the sense inventory_movements and
-- `sales` already are: no UPDATE/DELETE grant for `authenticated`
-- (20260823131200_alter_tables_grant_authenticated_customers.sql), and the
-- sole write path is record_store_credit_entry() (SECURITY DEFINER, bypasses
-- both). Correcting a mistaken entry means writing a compensating
-- 'adjustment' entry, never editing this row.
--
-- `amount` is signed (positive = credit issued, negative = credit spent)
-- rather than an unsigned magnitude plus a direction flag, so a balance is
-- literally `sum(amount)` — one expression, no per-call-site interpretation
-- of what `entry_type` implies about sign. The CHECK below is what keeps
-- `entry_type` and the sign of `amount` from ever contradicting each other.
--
-- `balance_after` is the running balance at the moment this entry was
-- written (docs/Customer Management_Store_Credit_and_Layaway.md §46) —
-- the same role inventory_movements.quantity_after plays. It makes the
-- ledger self-auditing: any drift between `sum(amount)` and the newest
-- `balance_after` (or store_credit_accounts.balance) is provably a bug,
-- which is what this milestone's Risks section asks to be able to detect.
--
-- `reference_type`/`reference_id` are an untyped soft reference, exactly as
-- inventory_movements does it: an entry can point at a `sale` (spent at
-- checkout) or a `refund` (issued from a refund) without this table carrying
-- two mostly-null FK columns, and without a FK cycle back into M08's tables.
create table public.store_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.store_credit_accounts(id) on delete restrict,

  entry_type text not null check (entry_type in ('issue', 'spend', 'refund_to_credit', 'adjustment')),
  amount numeric(14, 2) not null check (amount <> 0),
  balance_after numeric(14, 2) not null check (balance_after >= 0),

  reason text,
  reference_type text,
  reference_id uuid,

  created_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,

  -- The sign of `amount` is derivable from `entry_type` for every type
  -- except 'adjustment', which exists precisely to correct in either
  -- direction. Encoding that here means no application code has to remember
  -- to negate a spend.
  constraint store_credit_ledger_amount_sign_check check (
    case entry_type
      when 'issue' then amount > 0
      when 'refund_to_credit' then amount > 0
      when 'spend' then amount < 0
      else true
    end
  )
);

create index store_credit_ledger_account_id_idx
  on public.store_credit_ledger (account_id, created_at desc);
create index store_credit_ledger_reference_idx
  on public.store_credit_ledger (reference_type, reference_id)
  where reference_id is not null;

alter table public.store_credit_ledger enable row level security;
