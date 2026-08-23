-- SELECT-only across all three tables — same append-only-via-RPC shape as
-- sales/store_credit_ledger. The write paths are create_layaway(),
-- record_layaway_payment(), and cancel_layaway()
-- (20260823130700_create_customer_functions.sql), all SECURITY DEFINER, and
-- no INSERT/UPDATE/DELETE grant exists for `authenticated`
-- (20260823131200_alter_tables_grant_authenticated_customers.sql). That is
-- what makes an installment immutable at the database level, per this
-- milestone's FR ("correcting a mistaken payment happens via a new ledger
-- entry, never an edit to the original").
--
-- Unlike customers/store_credit, layaways are branch-scoped: a layaway
-- holds physical stock at a specific branch and is fulfilled there, so
-- user_has_branch_access() is the right boundary — the same one `sales`
-- uses. The customer it belongs to stays business-wide; the layaway itself
-- does not.
create policy layaways_select on public.layaways
  for select
  using (public.user_has_branch_access(branch_id, organization_id));

create policy layaway_items_select on public.layaway_items
  for select
  using (
    exists (
      select 1 from public.layaways l
      where l.id = layaway_id
        and public.user_has_branch_access(l.branch_id, l.organization_id)
    )
  );

create policy layaway_payments_select on public.layaway_payments
  for select
  using (
    exists (
      select 1 from public.layaways l
      where l.id = layaway_id
        and public.user_has_branch_access(l.branch_id, l.organization_id)
    )
  );
