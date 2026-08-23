-- Same resolve-through-the-parent shape as sale_items_select.
create policy payments_select on public.payments
  for select
  using (
    exists (
      select 1 from public.sales s
      where s.id = sale_id
        and public.user_has_branch_access(s.branch_id, s.organization_id)
    )
  );
