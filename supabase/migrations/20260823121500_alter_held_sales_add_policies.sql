-- Unlike every table above, held_sales is an ordinary mutable table reached
-- directly via supabase-js (no RPC) — it's a draft, not a financial record.
-- INSERT/hold and the eventual resume-then-checkout both need `sales.create`;
-- DELETE covers both "resume completed, drop the draft" and the explicit
-- discard action lib/sales/mutations.ts's discardHeldSale() gates on
-- `sales.cancel` — RLS can't distinguish those two call sites' *intent*, so
-- it accepts either permission, leaving the specific choice of which one to
-- require to the TS mutation layer per this milestone's Security
-- Requirements ("sales.cancel" is explicitly named there).
create policy held_sales_select on public.held_sales
  for select
  using (public.user_has_branch_access(branch_id, organization_id));

create policy held_sales_insert on public.held_sales
  for insert
  with check (
    public.user_has_branch_access(branch_id, organization_id)
    and public.user_has_permission('sales.create', organization_id, branch_id)
  );

create policy held_sales_delete on public.held_sales
  for delete
  using (
    public.user_has_branch_access(branch_id, organization_id)
    and (
      public.user_has_permission('sales.create', organization_id, branch_id)
      or public.user_has_permission('sales.cancel', organization_id, branch_id)
    )
  );
