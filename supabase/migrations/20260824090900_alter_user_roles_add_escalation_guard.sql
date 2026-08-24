-- Closes the last escalation door in the RBAC surface.
--
-- 20260822094800_alter_user_roles_add_policies.sql gates assignment on
-- `roles.assign` alone. That was correct while the role catalog was a fixed,
-- seeded list — but Milestone 11 makes roles authorable, and the two
-- together are a hole: holding `roles.assign` and nothing else would let you
-- assign the seeded **Owner** role (which cross-joins the entire permission
-- catalog) to yourself, a colleague, or an invited puppet account. The
-- role-builder policies in 20260824090800 would be beside the point, since
-- no new role needs to be built to pull it off.
--
-- The fix is the same predicate the role builder uses, applied to the other
-- verb: you may hand out a role only if you personally hold, org-wide, every
-- permission it grants. `roles.assign` remains the "may you assign at all"
-- gate; user_grants_cover_role() is the "may you assign *this*" gate.
--
-- Unaffected by design:
--   - create_organization_with_owner() (20260822093600) and
--     accept_employee_invitation() (20260824090500) are SECURITY DEFINER and
--     so bypass RLS entirely. That is correct in both cases: the first
--     bootstraps the very first Owner, when nobody holds anything yet; the
--     second acts for an invitee who holds nothing, and its escalation check
--     was already spent at invite time by the employee_invitations policies.
--   - Existing integration tests assign roles as an Owner, who passes
--     user_grants_cover_role() trivially against every role in the catalog.
--
-- The select and delete policies are untouched: reading who holds what, and
-- revoking, are not escalations. Revoking in particular must stay available
-- to anyone with roles.assign — being unable to take back a role you cannot
-- currently grant would strand assignments permanently.

drop policy user_roles_insert on public.user_roles;
drop policy user_roles_update on public.user_roles;

create policy user_roles_insert on public.user_roles
  for insert
  with check (
    public.user_has_permission('roles.assign', organization_id)
    and public.user_grants_cover_role(role_id)
  );

create policy user_roles_update on public.user_roles
  for update
  using (
    public.user_has_permission('roles.assign', organization_id)
    and public.user_grants_cover_role(role_id)
  )
  with check (
    public.user_has_permission('roles.assign', organization_id)
    and public.user_grants_cover_role(role_id)
  );
