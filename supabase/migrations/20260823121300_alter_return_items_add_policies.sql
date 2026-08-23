-- Same resolve-through-the-parent shape as sale_items_select, resolving
-- through `returns` instead of `sales`.
create policy return_items_select on public.return_items
  for select
  using (
    exists (
      select 1 from public.returns r
      where r.id = return_id
        and public.user_has_branch_access(r.branch_id, r.organization_id)
    )
  );
