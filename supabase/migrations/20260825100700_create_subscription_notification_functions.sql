-- Subscription notification triggers and the daily sweep
-- (docs/milestones/13-subscription-billing-and-platform-admin.md Scope:
-- "Expiry warning: 7 days before expiry, dashboard banner + email"; CI/CD
-- Requirements: "a scheduled ... job that evaluates approaching/passed
-- expiry dates daily"). Follows 20260824100400's notify_*() contract
-- exactly — see that migration's header for the five-step shape every
-- function here repeats. Zero notification schema changes: the `billing`
-- category already exists and is mandatory (lib/notifications/types.ts),
-- seeded in Milestone 12 specifically so this migration adds none.
--
-- Recipients resolve on `subscription.renew` (billing-scoped, org-wide) —
-- the Owner, not every user of the org. The BANNER shows to everyone (they
-- are all affected by a lockout); the EMAIL goes only to whoever can
-- actually act on it. That split lives here, in the recipient resolution,
-- not in lib/notifications/subscription.ts.
create or replace function public.notify_subscription_expiring(p_organization_id uuid)
returns table (
  notification_id uuid,
  user_id uuid,
  email text,
  full_name text,
  email_enabled boolean,
  organization_name text,
  days_remaining integer,
  current_period_end timestamptz,
  price_minor bigint,
  currency text,
  href text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub record;
  v_organization_name text;
begin
  select * into v_sub from public.subscriptions where organization_id = p_organization_id;
  if v_sub is null then
    return;
  end if;

  select name into v_organization_name from public.organizations where id = p_organization_id;

  return query
  with recipients as (
    select r.* from public.resolve_notification_recipients(
      'subscription.renew', p_organization_id, null, 'billing'
    ) r
    where r.in_app_enabled
  ),
  inserted as (
    select
      public.create_user_notification(
        rec.user_id,
        p_organization_id,
        'billing',
        'subscription.expiring',
        'Your subscription expires soon',
        'Your subscription expires on ' || to_char(v_sub.current_period_end, 'FMMonth DD, YYYY') ||
          '. Renew now to avoid losing access.',
        '/settings/subscription',
        jsonb_build_object('subscriptionId', v_sub.id, 'currentPeriodEnd', v_sub.current_period_end),
        -- Keyed to THIS period, so a renewal that moves current_period_end
        -- re-arms the warning for the next cycle rather than deduping forever.
        'subscription.expiring:' || v_sub.id || ':' || v_sub.current_period_end::date
      ) as id,
      rec.user_id, rec.email, rec.full_name, rec.email_enabled
    from recipients rec
  )
  select
    i.id, i.user_id, i.email, i.full_name, i.email_enabled, v_organization_name,
    ceil(extract(epoch from (v_sub.current_period_end - now())) / 86400)::int,
    v_sub.current_period_end, v_sub.price_minor, v_sub.currency,
    '/settings/subscription'
  from inserted i
  where i.id is not null;
end;
$$;

create or replace function public.notify_subscription_expired(p_organization_id uuid)
returns table (
  notification_id uuid,
  user_id uuid,
  email text,
  full_name text,
  email_enabled boolean,
  organization_name text,
  current_period_end timestamptz,
  href text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub record;
  v_organization_name text;
begin
  select * into v_sub from public.subscriptions where organization_id = p_organization_id;
  if v_sub is null then
    return;
  end if;

  select name into v_organization_name from public.organizations where id = p_organization_id;

  return query
  with recipients as (
    select r.* from public.resolve_notification_recipients(
      'subscription.renew', p_organization_id, null, 'billing'
    ) r
    where r.in_app_enabled
  ),
  inserted as (
    select
      public.create_user_notification(
        rec.user_id,
        p_organization_id,
        'billing',
        'subscription.expired',
        'Your subscription has expired',
        'Access is locked until the subscription is renewed.',
        '/settings/subscription',
        jsonb_build_object('subscriptionId', v_sub.id),
        'subscription.expired:' || v_sub.id || ':' || v_sub.current_period_end::date
      ) as id,
      rec.user_id, rec.email, rec.full_name, rec.email_enabled
    from recipients rec
  )
  select i.id, i.user_id, i.email, i.full_name, i.email_enabled, v_organization_name, v_sub.current_period_end, '/settings/subscription'
  from inserted i
  where i.id is not null;
end;
$$;

-- A renewal is a discrete event, not a recurring condition — dedupe_key is
-- null here, same reasoning notify_role_assigned() gives for its own null:
-- deduping would hide a genuine second payment.
create or replace function public.notify_subscription_renewed(p_payment_id uuid)
returns table (
  notification_id uuid,
  user_id uuid,
  email text,
  full_name text,
  email_enabled boolean,
  organization_name text,
  new_period_end timestamptz,
  href text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_organization_name text;
  v_period_end timestamptz;
begin
  select p.organization_id, s.current_period_end, o.name
  into v_organization_id, v_period_end, v_organization_name
  from public.subscription_payments p
  join public.subscriptions s on s.id = p.subscription_id
  join public.organizations o on o.id = p.organization_id
  where p.id = p_payment_id;

  if v_organization_id is null then
    return;
  end if;

  return query
  with recipients as (
    select r.* from public.resolve_notification_recipients(
      'subscription.renew', v_organization_id, null, 'billing'
    ) r
    where r.in_app_enabled
  ),
  inserted as (
    select
      public.create_user_notification(
        rec.user_id,
        v_organization_id,
        'billing',
        'subscription.renewed',
        'Subscription renewed',
        'Your subscription is now active until ' || to_char(v_period_end, 'FMMonth DD, YYYY') || '.',
        '/settings/subscription',
        jsonb_build_object('paymentId', p_payment_id, 'newPeriodEnd', v_period_end),
        null
      ) as id,
      rec.user_id, rec.email, rec.full_name, rec.email_enabled
    from recipients rec
  )
  select i.id, i.user_id, i.email, i.full_name, i.email_enabled, v_organization_name, v_period_end, '/settings/subscription'
  from inserted i
  where i.id is not null;
end;
$$;

revoke execute on function public.notify_subscription_expiring(uuid) from public;
revoke execute on function public.notify_subscription_expired(uuid) from public;
revoke execute on function public.notify_subscription_renewed(uuid) from public;
grant execute on function public.notify_subscription_expiring(uuid) to service_role;
grant execute on function public.notify_subscription_expired(uuid) to service_role;
grant execute on function public.notify_subscription_renewed(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- The daily sweep. service_role only — called exclusively from
-- lib/subscription/sweep.ts, itself called only by
-- app/api/cron/subscriptions/route.ts, which is gated by CRON_SECRET.
--
-- status is refreshed here (ACTIVE -> EXPIRING -> EXPIRED) for DISPLAY
-- purposes only — organization_access_permitted() (20260825100500) never
-- reads it, so a day's delay in this job running does not delay the lock
-- itself, only the "EXPIRING" badge some screen might render.
--
-- DOES NOT CALL notify_subscription_expiring()/notify_subscription_expired()
-- ITSELF. An earlier version did, via `perform`, which discards a function's
-- return value — and the return value IS the email worklist (see
-- notify_low_stock()'s own contract: "the RETURNING set is the outbox").
-- Calling them here would create the in-app rows but silently drop every
-- email, defeating "7 days before expiry ... receive an email warning."
-- Returning the affected organization ids instead lets
-- lib/subscription/sweep.ts call the TS wrappers
-- (lib/notifications/subscription.ts), which both insert the in-app row AND
-- send the email — the same division of labor every other notify_*() event
-- in this codebase already uses.
--
-- Also carries Milestone 12's deferred notification retention sweep
-- (DECISIONS_AND_CONFLICTS.md §6: "Milestone 13 ... needs a scheduled-
-- execution primitive anyway ... building that primitive once and adding a
-- three-line sweep to it is less infrastructure than building a scheduler
-- twice") — a few lines, not a second job.
create or replace function public.run_subscription_daily_sweep()
returns table (
  expiring_organization_ids uuid[],
  expired_organization_ids uuid[],
  notifications_purged integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expiring_ids uuid[];
  v_expired_ids uuid[];
  v_purged_count integer := 0;
  v_org_id uuid;
begin
  select array_agg(organization_id) into v_expiring_ids
  from public.subscriptions
  where status = 'ACTIVE'
    and current_period_end > now()
    and current_period_end <= now() + interval '7 days';

  update public.subscriptions
  set status = 'EXPIRING'
  where organization_id = any(v_expiring_ids);

  select array_agg(organization_id) into v_expired_ids
  from public.subscriptions
  where status <> 'EXPIRED'
    and current_period_end <= now();

  update public.subscriptions
  set status = 'EXPIRED'
  where organization_id = any(v_expired_ids);

  if v_expired_ids is not null then
    foreach v_org_id in array v_expired_ids loop
      perform public.record_audit_event(
        v_org_id, null, 'subscription.expired', 'subscriptions', null
      );
    end loop;
  end if;

  -- Milestone 12's deferred retention sweep.
  with purged as (
    delete from public.notifications
    where read_at is not null
      and created_at < now() - interval '90 days'
    returning 1
  )
  select count(*) into v_purged_count from purged;

  return query select v_expiring_ids, v_expired_ids, v_purged_count;
end;
$$;

comment on function public.run_subscription_daily_sweep() is
  'Called once daily via lib/subscription/sweep.ts. Refreshes '
  'subscriptions.status for DISPLAY (the lock itself reads current_period_end '
  'directly and is unaffected by this job''s cadence), audits each newly '
  'expired organization, and sweeps notifications older than 90 days that '
  'have already been read — Milestone 12''s deferred retention work, landed '
  'here per DECISIONS_AND_CONFLICTS.md §6. Returns the affected organization '
  'ids rather than firing notifications itself — see the function body''s own '
  'comment for why.';

revoke execute on function public.run_subscription_daily_sweep() from public;
grant execute on function public.run_subscription_daily_sweep() to service_role;
