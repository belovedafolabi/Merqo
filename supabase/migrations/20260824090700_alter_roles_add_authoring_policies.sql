-- The mutation policies 20260822094500_alter_roles_add_policies.sql
-- deliberately deferred: "creating a custom role is Milestone 11's
-- role-builder UI, which will add its own permission and policy alongside
-- that feature." This is that policy.
--
-- Only two of them. There is no delete policy, on purpose: deleting a role
-- would cascade its role_permissions rows away while user_roles.role_id is
-- ON DELETE RESTRICT (20260822091200), so a role in use cannot be deleted
-- anyway and a role not in use costs nothing to leave. Retiring a role is a
-- Milestone 15 question about lifecycle, not something to half-answer here.

create policy roles_insert on public.roles
  for insert
  to authenticated
  with check (
    -- A custom role can never be born a system role. The seven seeded roles
    -- (supabase/seed.sql §4) are the only is_system_role = true rows there
    -- will ever be.
    is_system_role = false
    -- Attribution: you author as yourself. `roles.created_by` is what the
    -- employee directory shows as "created by", and letting it be forged
    -- would make the audit trail lie about who introduced a set of powers.
    and created_by = auth.uid()
    and public.user_can_author_roles()
  );

create policy roles_update on public.roles
  for update
  to authenticated
  using (
    is_system_role = false
    and public.user_can_author_roles()
  )
  with check (
    -- `is_system_role = false` appears in BOTH clauses, and they stop
    -- different things. USING blocks editing one of the seeded roles.
    -- WITH CHECK blocks the far subtler move: taking a custom role you are
    -- allowed to edit and flipping it INTO a system role. That row would
    -- then be permanently uneditable (USING would reject it forever), would
    -- render as built-in in every UI, and — because
    -- 20260824090800's role_permissions policies both exclude system roles —
    -- would freeze whatever permission set it happened to hold at that
    -- moment, beyond anyone's reach.
    is_system_role = false
    and public.user_can_author_roles()
  );
