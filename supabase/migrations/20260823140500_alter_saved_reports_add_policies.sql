-- Visibility tiers, evaluated inside the org boundary in every case — an
-- 'organization'-visible report is shared with that organization, never
-- across organizations. Reading the three branches in order: a report shared
-- org-wide is readable by any member; one shared to a branch is readable by
-- anyone with access to that branch; otherwise only its author can see it.
--
-- Note this policy gates the *configuration*, not the data. Loading someone
-- else's shared report does not widen what its results contain: running it
-- goes through the report functions (20260823141000/141100), which are
-- SECURITY INVOKER, so the reader's own RLS still decides which rows they see.
-- A Branch Manager opening an org-wide saved report gets their branch's
-- numbers, not the author's.
create policy saved_reports_select on public.saved_reports
  for select
  using (
    public.user_has_org_access(organization_id)
    and (
      visibility = 'organization'
      or (
        visibility = 'branch'
        and branch_id is not null
        and public.user_has_branch_access(branch_id, organization_id)
      )
      or created_by = auth.uid()
    )
  );

-- `created_by = auth.uid()` on insert for the same reason expenses_insert has
-- it: authorship is asserted by the database, not by the client.
create policy saved_reports_insert on public.saved_reports
  for insert
  with check (
    public.user_has_org_access(organization_id)
    and public.user_has_permission('reports.save', organization_id)
    and created_by = auth.uid()
  );

-- Update is restricted to the author, and the WITH CHECK repeats the
-- condition so an update cannot hand the row to someone else. Archiving runs
-- through this same policy — there is deliberately no DELETE policy, so a
-- saved report is soft-archived like every other operational entity
-- (docs/architecture/database-conventions.md) rather than vanishing from
-- under anyone who had it shared with them.
create policy saved_reports_update on public.saved_reports
  for update
  using (
    public.user_has_org_access(organization_id)
    and created_by = auth.uid()
    and public.user_has_permission('reports.save', organization_id)
  )
  with check (
    public.user_has_org_access(organization_id)
    and created_by = auth.uid()
  );
