-- The invitee's entire interaction with public.employee_invitations.
--
-- Both functions are SECURITY DEFINER because RLS cannot help someone who
-- holds no role in the organization yet — the same chicken-and-egg
-- create_organization_with_owner() (20260822093600) solves for the very
-- first Owner. The authorization that matters happened earlier: the
-- employee_invitations policies (20260824090400) already proved the INVITER
-- held employees.invite and personally held every permission the invited
-- role grants. Acceptance is not a second authorization decision; it is the
-- redemption of one already made.

-- Read-only status lookup, so /invite/[token] can render "this link expired"
-- instead of a dead end, and so the sign-up form knows which email address
-- the invitation is bound to.
--
-- GRANTED TO anon. Deliberate, and safe for two reasons: the argument is a
-- SHA-256 digest of a 256-bit random token, so the space is not enumerable
-- and possession of the hash already implies possession of the link; and the
-- return payload is limited to what the invitee must see to act on it. Note
-- what it does NOT return — the role's permission list, the organization id,
-- the inviter, or anything about other invitations.
--
-- Returns zero rows for an unknown hash rather than raising: "no such
-- invitation" is a page state, not an exception, and a raise here would put
-- an error in the logs on every stale bookmark.
create or replace function public.get_employee_invitation(p_token_hash text)
returns table (
  organization_name text,
  role_name text,
  email text,
  expires_at timestamptz,
  status text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    o.name,
    r.name,
    inv.email,
    inv.expires_at,
    case
      when inv.revoked_at is not null then 'revoked'
      when inv.accepted_at is not null then 'accepted'
      when inv.expires_at <= now() then 'expired'
      else 'pending'
    end
  from public.employee_invitations inv
  join public.organizations o on o.id = inv.organization_id
  join public.roles r on r.id = inv.role_id
  where inv.token_hash = p_token_hash;
$$;

-- Redeem an invitation for the CALLING user. The caller has just signed up
-- (or signed in) as the invited email; app/(auth)/invite/actions.ts calls
-- this immediately afterwards.
--
-- Error strings are stable machine-readable tokens, not sentences:
-- lib/employees/mutations.ts maps them to user-facing copy, so wording can
-- change without breaking the mapping, and the tests assert on the token.
create or replace function public.accept_employee_invitation(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_inv public.employee_invitations;
  v_user_role_id uuid;
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  -- FOR UPDATE is what makes single-use race-safe. A double-clicked link, or
  -- the same link opened in two tabs, produces two concurrent calls; the row
  -- lock serialises them, so the second one sees accepted_at already set by
  -- the first and is rejected below rather than inserting a second
  -- user_roles row.
  select * into v_inv
  from public.employee_invitations
  where token_hash = p_token_hash
  for update;

  if v_inv.id is null then
    raise exception 'invalid_invitation' using errcode = 'P0002';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'invitation_revoked' using errcode = 'P0001';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'invitation_already_accepted' using errcode = 'P0001';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'invitation_expired' using errcode = 'P0001';
  end if;

  select u.email into v_email from public.users u where u.id = v_user;

  -- The invitation is bound to an address, and only its holder may redeem
  -- it. Without this, anyone who obtained the link — forwarded mail, a
  -- shared screen, a proxy log — could claim the role it carries. Compared
  -- case-insensitively to match users_email_key's lower(email) uniqueness.
  if v_email is null or lower(v_email) <> lower(v_inv.email) then
    raise exception 'invitation_email_mismatch' using errcode = 'P0001';
  end if;

  -- An invitee who already belongs to this organization at this exact scope
  -- (re-invited, or accepting a link for a role they were separately given)
  -- is not an error. Reuse the existing grant so the unique index
  -- user_roles_scope_unique is never violated, and still mark the invitation
  -- consumed below.
  select ur.id into v_user_role_id
  from public.user_roles ur
  where ur.user_id = v_user
    and ur.role_id = v_inv.role_id
    and ur.organization_id = v_inv.organization_id
    and ur.branch_id is not distinct from v_inv.branch_id
    and ur.business_unit_id is not distinct from v_inv.business_unit_id;

  if v_user_role_id is null then
    insert into public.user_roles (
      user_id, role_id, organization_id, branch_id, business_unit_id, created_by
    )
    values (
      v_user, v_inv.role_id, v_inv.organization_id, v_inv.branch_id,
      v_inv.business_unit_id,
      -- Attributed to the inviter, not to the invitee: the authorization
      -- decision was theirs. A self-attributed row would read, in the audit
      -- trail, as the new employee having granted themselves the role.
      v_inv.created_by
    )
    returning id into v_user_role_id;
  end if;

  update public.employee_invitations
  set accepted_at = now(), accepted_by = v_user
  where id = v_inv.id;

  perform public.record_audit_event(
    v_inv.organization_id, v_user, 'employee_invitation.accepted',
    'employee_invitation', v_inv.id,
    jsonb_build_object('role_id', v_inv.role_id, 'email', v_inv.email)
  );
  perform public.record_audit_event(
    v_inv.organization_id, v_user, 'user_role.assigned',
    'user_role', v_user_role_id,
    jsonb_build_object('role_id', v_inv.role_id, 'via', 'invitation')
  );

  return v_user_role_id;
end;
$$;

revoke execute on function public.get_employee_invitation(text) from public;
revoke execute on function public.accept_employee_invitation(text) from public;

-- anon on the lookup: the invitee reads the page before they have a session.
grant execute on function public.get_employee_invitation(text) to anon, authenticated;
-- authenticated only on the redemption: it needs auth.uid() to have a value.
grant execute on function public.accept_employee_invitation(text) to authenticated;
