-- sale_items has no organization_id/branch_id of its own — resolved through
-- its parent sale, same shape as stock_transfer_items_select resolving
-- through stock_transfers.
create policy sale_items_select on public.sale_items
  for select
  using (
    exists (
      select 1 from public.sales s
      where s.id = sale_id
        and public.user_has_branch_access(s.branch_id, s.organization_id)
    )
  );
