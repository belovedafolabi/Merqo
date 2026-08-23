-- Refund authorization is a distinct, auditable step from refund initiation
-- (this milestone's Security Requirements) — modeled as a status lifecycle
-- ('pending' -> 'approved'/'rejected') rather than a boolean, so the request
-- itself is always recorded even before a decision is made.
-- `initiated_by`/`authorized_by` are two separate columns for exactly that
-- reason: docs/Financials_Payments_and_Internal_Auditing.md §26's "Cashier
-- requests -> Manager approves" flow is enforced entirely by which
-- permission (refund.initiate vs refund.approve — supabase/seed.sql) a given
-- role holds, not by a same-person check on this table — see
-- lib/sales/mutations.ts's requestRefund()/approveRefund() and this
-- milestone's plan doc for the reasoning. No UPDATE/DELETE grant for
-- `authenticated`: the only status transition path is decide_refund()
-- (20260823120800_create_sales_functions.sql, SECURITY DEFINER).
--
-- `return_id` is nullable — a refund can reference a return (physical goods
-- came back) or stand alone against a sale (e.g. a price correction with no
-- item returned).
create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  return_id uuid references public.returns(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,

  amount numeric(14, 2) not null check (amount > 0),
  method text not null check (method in ('cash', 'card', 'transfer', 'store_credit')),
  reason text not null,

  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  initiated_by uuid references public.users(id) on delete set null,
  authorized_by uuid references public.users(id) on delete set null,

  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index refunds_sale_id_idx on public.refunds (sale_id);
create index refunds_branch_id_idx on public.refunds (branch_id, created_at desc);
create index refunds_status_idx on public.refunds (status) where status = 'pending';

alter table public.refunds enable row level security;
