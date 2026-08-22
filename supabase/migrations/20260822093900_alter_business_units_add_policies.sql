-- business_units has no organization_id column of its own (by design — it
-- belongs to a branch, which belongs to an organization), so INSERT/UPDATE
-- checks resolve the owning organization through branches (a different
-- table than the one this policy protects, so re-querying it here is safe —
-- see user_has_branch_access()'s and user_has_business_unit_access()'s own
-- doc comments in 20260822093300_create_authorization_functions.sql for why
-- the SAME kind of lookup back onto business_units itself would not be).
create policy business_units_select on public.business_units
  for select
  using (public.user_has_business_unit_access(id, branch_id));

create policy business_units_insert on public.business_units
  for insert
  with check (
    public.user_has_branch_access(branch_id, (select organization_id from public.branches where id = branch_id))
    and public.user_has_permission(
      'business_units.create',
      (select organization_id from public.branches where id = branch_id)
    )
  );

create policy business_units_update on public.business_units
  for update
  using (
    public.user_has_business_unit_access(id, branch_id)
    and public.user_has_permission(
      'business_units.update',
      (select organization_id from public.branches where id = branch_id)
    )
  )
  with check (
    public.user_has_business_unit_access(id, branch_id)
    and public.user_has_permission(
      'business_units.update',
      (select organization_id from public.branches where id = branch_id)
    )
  );
