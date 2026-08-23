-- SELECT-only, same append-only-via-RPC shape as sales_select. `returns`
-- carries its own (denormalized) organization_id/branch_id, so this reads
-- directly rather than joining to `sales`.
create policy returns_select on public.returns
  for select
  using (public.user_has_branch_access(branch_id, organization_id));
