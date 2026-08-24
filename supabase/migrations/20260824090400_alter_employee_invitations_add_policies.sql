-- Policies for public.employee_invitations.
--
-- The invitee is NOT a subject of these policies. At the moment they click
-- the link they hold no user_roles row in the organization — often no account
-- at all — so no RLS predicate could ever match for them. Their whole
-- interaction goes through the two SECURITY DEFINER functions in
-- 20260824090500, which is also why there is no anon-facing policy here.
--
-- THE ESCALATION CONJUNCT. Insert and update both require
-- user_grants_cover_role(role_id) alongside employees.invite. Without it,
-- `employees.invite` on its own is a complete privilege-escalation kit:
-- invite a throwaway address as **Owner**, accept it yourself in another
-- browser, and you hold the entire permission catalog. It is precisely the
-- escalation 20260824090800 blocks in the role builder and 20260824090900
-- blocks on direct assignment — arriving through a third door. All three
-- doors get the same lock.

create policy employee_invitations_select on public.employee_invitations
  for select
  to authenticated
  using (
    public.user_has_org_access(organization_id)
    and public.user_has_permission('employees.invite', organization_id)
  );

create policy employee_invitations_insert on public.employee_invitations
  for insert
  to authenticated
  with check (
    public.user_has_permission('employees.invite', organization_id)
    and public.user_grants_cover_role(role_id)
    -- Attribution, same reasoning as roles_insert: accept_employee_invitation()
    -- copies created_by onto the resulting user_roles row, so a forged value
    -- would misattribute who brought this person into the organization.
    and created_by = auth.uid()
  );

-- Covers both mutations the directory offers: resend (new token_hash, new
-- expires_at) and revoke (revoked_at set). Same predicate in USING and WITH
-- CHECK so a row cannot be moved out of the caller's authority mid-update —
-- e.g. re-pointing a pending invitation at a richer role than the caller
-- holds, which would otherwise sail past the insert-time check.
create policy employee_invitations_update on public.employee_invitations
  for update
  to authenticated
  using (
    public.user_has_permission('employees.invite', organization_id)
    and public.user_grants_cover_role(role_id)
  )
  with check (
    public.user_has_permission('employees.invite', organization_id)
    and public.user_grants_cover_role(role_id)
  );

-- No delete policy. Revocation is an update (revoked_at), so the record of
-- who was invited, by whom, to what, and whether it was withdrawn survives —
-- the same append-only instinct audit_logs and expenses follow.
