-- The only write path to public.users.deactivated_at.
--
-- DELIBERATE DEVIATION from the SECURITY DEFINER convention that
-- 20260823120800_create_sales_functions.sql established and every write
-- function since has followed ("these functions do not re-check permissions;
-- lib/*/mutations.ts's requirePermission() is the gate, and the table grants
-- leave no second path"). That division works when the table grants close the
-- back door. Here they cannot: public.users already grants `update` to
-- `authenticated` for the self-service profile edit (users_update_self,
-- 20260822094400), and this function must be callable by an admin acting on
-- someone else's row — so it is granted to `authenticated` and is therefore
-- reachable by any signed-in user via `POST /rest/v1/rpc/set_employee_active`,
-- application layer or not. Deactivation is also the single most abusable
-- action in this milestone (deactivate the Owner, own the org). So the
-- permission check lives inside the function, where the definer's own
-- elevation cannot route around it.

create or replace function public.set_employee_active(
  p_user_id uuid,
  p_organization_id uuid,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- Checked here rather than by RLS: SECURITY DEFINER bypasses RLS by
  -- design, so RLS on public.users would never see this update at all.
  if not public.user_has_permission('employees.deactivate', p_organization_id) then
    raise exception 'employees.deactivate required' using errcode = '42501';
  end if;

  -- Self-deactivation is refused outright. Not a nicety: an org's last Owner
  -- deactivating themselves is unrecoverable through the product — nobody
  -- left holds employees.deactivate to turn them back on. The milestone's
  -- "self-elevation is disallowed" rule has a mirror image, and this is it.
  if p_user_id = v_actor then
    raise exception 'cannot change your own active status' using errcode = 'P0001';
  end if;

  -- Cross-org isolation. Without this, holding employees.deactivate in your
  -- own organization would let you deactivate any user id in the database —
  -- the argument names the org, so the permission check alone proves nothing
  -- about the target.
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = p_user_id
      and ur.organization_id = p_organization_id
  ) then
    raise exception 'user % is not a member of organization %', p_user_id, p_organization_id
      using errcode = 'P0002';
  end if;

  update public.users
  set deactivated_at = case when p_active then null else now() end
  where id = p_user_id;

  -- Defence 2 of 3 (see 20260824090100's header). The authorization functions
  -- already strip every grant from the live access token; killing the GoTrue
  -- rows additionally stops the refresh token minting a fresh one, so the
  -- session cannot outlive its own expiry window.
  --
  -- Guarded on to_regclass: auth.sessions/auth.refresh_tokens belong to
  -- GoTrue, not to this schema. If a future Supabase release renames or drops
  -- them, this degrades to a no-op — defence 1 still holds — rather than
  -- failing every deactivation with an undefined-table error.
  if not p_active then
    if to_regclass('auth.sessions') is not null then
      delete from auth.sessions where user_id = p_user_id;
    end if;
    if to_regclass('auth.refresh_tokens') is not null then
      delete from auth.refresh_tokens where user_id = p_user_id::text;
    end if;
  end if;

  -- user_id is the ACTING user (audit_logs' documented meaning); the target
  -- travels in resource_id and metadata.
  perform public.record_audit_event(
    p_organization_id,
    v_actor,
    case when p_active then 'employee.reactivated' else 'employee.deactivated' end,
    'user',
    p_user_id,
    jsonb_build_object('target_user_id', p_user_id)
  );
end;
$$;

comment on function public.set_employee_active(uuid, uuid, boolean) is
  'Deactivate or reactivate an employee. Permission-checked inside the '
  'function (see file header), refuses self-targeting, org-scoped, audited.';

revoke execute on function public.set_employee_active(uuid, uuid, boolean) from public;
grant execute on function public.set_employee_active(uuid, uuid, boolean) to authenticated;
