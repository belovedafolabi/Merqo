-- The two status transitions an expense can undergo after it is recorded.
--
-- Both are `SECURITY DEFINER` and neither re-checks permissions — the exact
-- division of responsibility 20260823120800_create_sales_functions.sql's
-- header documents and every write function since has followed:
-- lib/expenses/mutations.ts's requirePermission() calls are the authorization
-- gate, and these functions exist to be the *only* way the row can change.
-- `expenses` grants `authenticated` select+insert and nothing else
-- (20260823141200), so there is no second path a caller could take.
--
-- Modeled directly on decide_refund() (20260823130800), including its
-- "already decided" guard: a decision is made once. Re-deciding would let an
-- approver flip an expense in and out of a period's net profit repeatedly
-- with only the latest state visible.

-- Approve or reject a pending expense. `p_reason` is optional on approval and
-- meaningful on rejection ("duplicate", "no receipt") — stored on the row
-- rather than only in the audit log so the reason travels with the expense in
-- any listing.
create or replace function public.decide_expense(
  p_expense_id uuid,
  p_approved boolean,
  p_reason text
)
returns public.expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense public.expenses;
begin
  select * into v_expense from public.expenses where id = p_expense_id;
  if v_expense.id is null then
    raise exception 'unknown expense %', p_expense_id using errcode = 'P0002';
  end if;
  if v_expense.status <> 'pending' then
    raise exception 'expense % has already been decided', p_expense_id using errcode = 'P0001';
  end if;
  if v_expense.voided_at is not null then
    raise exception 'expense % has been voided', p_expense_id using errcode = 'P0001';
  end if;

  update public.expenses
  set status = case when p_approved then 'approved' else 'rejected' end,
      decision_reason = p_reason,
      approved_by = auth.uid(),
      decided_at = now()
  where id = p_expense_id
  returning * into v_expense;

  return v_expense;
end;
$$;

-- Void — the soft delete behind the `expense.delete` permission. Never a
-- hard DELETE: an approved expense already sits inside a reported net-profit
-- figure, and removing the row would change that figure for a closed period
-- with nothing left to explain it. Voiding leaves the record, its amount, and
-- the reason it was withdrawn all intact, and lib/reports/accounting.ts
-- simply excludes voided rows from the expense total.
--
-- A reason is required, not optional: this is the one action in the expense
-- lifecycle that moves reported profit without an originating business event,
-- which is why the permission is Owner-only by default (supabase/seed.sql).
create or replace function public.void_expense(
  p_expense_id uuid,
  p_reason text
)
returns public.expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense public.expenses;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a void reason is required' using errcode = 'P0004';
  end if;

  select * into v_expense from public.expenses where id = p_expense_id;
  if v_expense.id is null then
    raise exception 'unknown expense %', p_expense_id using errcode = 'P0002';
  end if;
  if v_expense.voided_at is not null then
    raise exception 'expense % has already been voided', p_expense_id using errcode = 'P0001';
  end if;

  update public.expenses
  set voided_at = now(),
      void_reason = p_reason
  where id = p_expense_id
  returning * into v_expense;

  return v_expense;
end;
$$;
