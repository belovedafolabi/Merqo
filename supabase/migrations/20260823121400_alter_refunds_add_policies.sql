-- SELECT-only, same append-only-via-RPC shape as sales_select — the only
-- status transition is decide_refund() (SECURITY DEFINER). Deliberately not
-- restricted to refund.approve holders: a Cashier who initiated a refund
-- request should still be able to see its status, same as they can see the
-- sale it refers to.
create policy refunds_select on public.refunds
  for select
  using (public.user_has_branch_access(branch_id, organization_id));
