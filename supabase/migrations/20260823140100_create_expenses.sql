-- Business expenses — the missing input to net profit.
--
-- Milestone 10's Functional Requirements demand that "accounting
-- calculations (revenue, COGS, gross profit, net profit) are correct", and
-- net profit is gross profit minus expenses
-- (docs/PRD.md §27, docs/Financial_Architecture_Accounting_Reconciliation.md
-- §34). No table in Milestones 02–09 records an expense, and no other
-- milestone doc claims one, so this milestone owns it. Columns follow
-- docs/Financial_Architecture_Accounting_Reconciliation.md §26's field list
-- exactly (category, amount, payment method, description, date, branch,
-- business unit, created by, approval status).
--
-- Explicitly NOT in scope: §28's configurable approval *thresholds*
-- ("≤ ₦50,000 → Manager, > ₦50,000 → Owner"). §28 itself says that "can be
-- configuration rather than hard-coded behavior", which makes it
-- configuration work belonging with Milestone 11's administration scope, not
-- a column invented speculatively here. Approval in this milestone is a plain
-- permission gate: whoever holds `expense.approve` can approve any amount.
--
-- Structural shape copied from `refunds` (20260823120500_create_refunds.sql),
-- which is the closest existing analogue — a money-moving record with a
-- request/decision lifecycle. That means, as on `refunds`:
--   * a 'pending' -> 'approved'/'rejected' status lifecycle rather than a
--     boolean, so the request is recorded even before anyone decides;
--   * `created_by` and `approved_by` as two separate columns, because
--     docs/PRD.md §27's "a cashier should not automatically have the ability
--     to create a ₦500,000 expense" is a two-actor flow enforced by which
--     permission a role holds (expense.create vs expense.approve);
--   * no `updated_at` / `set_updated_at` trigger, and no UPDATE or DELETE
--     grant for `authenticated` — the only mutation path after insert is
--     decide_expense()/void_expense() (20260823140200, SECURITY DEFINER).
--     That is what makes an expense's amount, category and date immutable
--     from the moment it is recorded, at the database level rather than by
--     convention. This is a deliberate, documented departure from
--     docs/architecture/database-conventions.md's standard audit columns,
--     matching the exception `refunds` and `audit_logs` already set.
--
-- Deletion is a soft void (`voided_at`), never a hard DELETE. A deleted
-- expense row would silently change an already-reported net profit for a
-- closed period with no trace of why — the same reproducibility argument that
-- makes `sales` append-only. `expense.delete` therefore grants the *void*
-- action; the name matches docs/PRD.md §27's permission list.
--
-- `business_unit_id` is nullable, unlike `branch_id`: real expenses are
-- frequently branch-wide (rent, electricity) with no meaningful Business Unit
-- to attribute them to. Forcing one would push operators into picking an
-- arbitrary BU and quietly corrupt any per-BU profit view.
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  business_unit_id uuid references public.business_units(id) on delete restrict,

  category text not null,
  amount numeric(14, 2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash', 'card', 'transfer')),
  description text,
  expense_date date not null,

  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decision_reason text,
  approved_by uuid references public.users(id) on delete set null,
  decided_at timestamptz,

  voided_at timestamptz,
  void_reason text,

  created_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null
);

-- `(branch_id, expense_date desc)` and `(organization_id, expense_date desc)`
-- serve the two shapes every financial report takes: one branch over a
-- period, and the whole organization over a period. Both are composite with
-- the date trailing because the date is always a range predicate and the
-- scope always an equality — a single-column scope index would leave the
-- range scanning every expense the branch or org ever recorded.
create index expenses_branch_expense_date_idx on public.expenses (branch_id, expense_date desc);
create index expenses_organization_expense_date_idx on public.expenses (organization_id, expense_date desc);

-- Partial, mirroring refunds_status_idx: the approval queue only ever asks
-- for pending rows, and pending is the small minority of a mature table.
create index expenses_status_idx on public.expenses (status) where status = 'pending';

alter table public.expenses enable row level security;
