-- SELECT-only, visible to a caller with branch access at either end of the
-- transfer. The sole write path is execute_stock_transfer() (SECURITY
-- DEFINER), same append-only-via-RPC shape as inventory_movements.
create policy stock_transfers_select on public.stock_transfers
  for select
  using (
    public.user_has_branch_access(source_branch_id, organization_id)
    or public.user_has_branch_access(destination_branch_id, organization_id)
  );

-- stock_transfer_items has no organization_id/branch_id of its own —
-- resolved through its parent transfer, same shape as product_prices_select
-- resolving through products.
create policy stock_transfer_items_select on public.stock_transfer_items
  for select
  using (
    exists (
      select 1
      from public.stock_transfers st
      where st.id = stock_transfer_id
        and (
          public.user_has_branch_access(st.source_branch_id, st.organization_id)
          or public.user_has_branch_access(st.destination_branch_id, st.organization_id)
        )
    )
  );
