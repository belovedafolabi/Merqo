-- SELECT + INSERT only. There is deliberately no UPDATE and no DELETE policy:
-- the only mutation path after insert is decide_expense()/void_expense()
-- (20260823140200, SECURITY DEFINER, which bypass RLS), paired with never
-- granting UPDATE/DELETE to `authenticated`
-- (20260823141200_alter_tables_grant_authenticated_reports.sql). That pairing
-- is what makes an expense's amount, category and date immutable from the
-- moment it is recorded — the same structural guarantee the identical
-- omission gives `sales`, `store_credit_ledger` and `refunds`, and the reason
-- a reported net-profit figure for a closed period cannot be quietly rewritten.
--
-- Unlike sales_select — which gates on branch access alone, so any org member
-- can read their branch's sales — expense visibility additionally requires
-- `expense.view`. An expense is not till-level operational data: amounts,
-- categories and approval state are management information, and
-- docs/PRD.md §27 makes expenses permission-controlled as a category, not
-- just their creation.
create policy expenses_select on public.expenses
  for select
  using (
    public.user_has_branch_access(branch_id, organization_id)
    and public.user_has_permission('expense.view', organization_id, branch_id, business_unit_id)
  );

-- `created_by = auth.uid()` is part of the CHECK, not left to the client:
-- without it a caller holding expense.create could attribute an expense to
-- another user, which would defeat the whole point of recording who spent
-- what. lib/expenses/mutations.ts sets it explicitly; this is the database
-- refusing anything else.
create policy expenses_insert on public.expenses
  for insert
  with check (
    public.user_has_branch_access(branch_id, organization_id)
    and public.user_has_permission('expense.create', organization_id, branch_id, business_unit_id)
    and created_by = auth.uid()
  );
