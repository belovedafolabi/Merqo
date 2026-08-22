-- Every user can always read/update their own row. Reading a colleague's row
-- (name, email — needed for "created by" attribution, employee lists, etc.)
-- is allowed once they share at least one organization; this milestone does
-- not further gate that by a permission (the fine-grained employee-directory
-- UI is Milestone 11's), it only has to guarantee cross-organization
-- isolation, which user_shares_org_with() enforces.
create policy users_select on public.users
  for select
  using (id = auth.uid() or public.user_shares_org_with(id));

create policy users_update_self on public.users
  for update
  using (id = auth.uid())
  with check (id = auth.uid());
