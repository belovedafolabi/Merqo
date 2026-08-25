-- Every organization needs a subscriptions row for
-- organization_access_permitted() (20260825100500) to have anything to
-- read — that function fails OPEN on a missing row precisely as a safety
-- net, not as the intended steady state. This migration closes the gap two
-- ways: new organizations get a trial subscription at creation, and existing
-- organizations are backfilled once, here.
--
-- TRIAL LENGTH IS UNSPECIFIED BY THE MILESTONE SPEC. 14 days is a documented
-- judgment call, kept as a single named constant so it is a one-line change
-- if the project owner wants a different number.
create or replace function public.create_organization_with_owner(
  p_organization_name text,
  p_organization_slug text,
  p_full_name text default null
)
returns table (organization_id uuid, user_role_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner_role_id uuid;
  v_organization_id uuid;
  v_user_role_id uuid;
  v_trial_days constant int := 14;
begin
  if v_user_id is null then
    raise exception 'create_organization_with_owner requires an authenticated caller';
  end if;

  if exists (select 1 from public.user_roles where user_id = v_user_id) then
    raise exception 'this user already belongs to an organization';
  end if;

  select id into v_owner_role_id from public.roles where slug = 'owner';
  if v_owner_role_id is null then
    raise exception 'seeded "owner" role not found — has supabase/seed.sql been applied?';
  end if;

  if p_full_name is not null then
    update public.users set full_name = p_full_name where id = v_user_id;
  end if;

  insert into public.organizations (name, slug, created_by)
  values (p_organization_name, p_organization_slug, v_user_id)
  returning id into v_organization_id;

  insert into public.user_roles (user_id, role_id, organization_id, created_by)
  values (v_user_id, v_owner_role_id, v_organization_id, v_user_id)
  returning id into v_user_role_id;

  -- Milestone 13: a 14-day trial subscription, so organization_access_
  -- permitted() (20260825100500) has a real row to read from the moment the
  -- organization exists, rather than relying on its fail-open branch.
  insert into public.subscriptions (
    organization_id, billing_period, price_minor, currency,
    current_period_start, current_period_end, status, is_trial
  )
  values (
    v_organization_id, 'MONTHLY', 0, 'NGN',
    now(), now() + (v_trial_days || ' days')::interval, 'ACTIVE', true
  );

  perform public.record_audit_event(
    v_organization_id, v_user_id, 'organization.created', 'organization', v_organization_id
  );
  perform public.record_audit_event(
    v_organization_id, v_user_id, 'user_role.assigned', 'user_role', v_user_role_id,
    jsonb_build_object('role_id', v_owner_role_id, 'target_user_id', v_user_id)
  );

  return query select v_organization_id, v_user_role_id;
end;
$$;

revoke execute on function public.create_organization_with_owner(text, text, text) from public;
grant execute on function public.create_organization_with_owner(text, text, text) to authenticated;

-- One-shot backfill for organizations bootstrapped before this migration.
-- Idempotent via subscriptions.organization_id's UNIQUE constraint, so CI's
-- double `supabase db reset` (which re-runs every migration against a fresh
-- seed each time) is safe, and re-running this migration against a database
-- that already has subscriptions rows is a no-op.
insert into public.subscriptions (
  organization_id, billing_period, price_minor, currency,
  current_period_start, current_period_end, status, is_trial
)
select o.id, 'MONTHLY', 0, 'NGN', now(), now() + interval '14 days', 'ACTIVE', true
from public.organizations o
on conflict (organization_id) do nothing;
