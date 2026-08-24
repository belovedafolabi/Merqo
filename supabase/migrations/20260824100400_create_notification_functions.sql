-- The notify_*() function family — the database-side half of
-- NotificationService (docs/TAS.md §33: business logic -> NotificationService
-- -> EmailService -> Resend). Every notification origin this milestone (and
-- every later one, per this file's own contract) is one SECURITY DEFINER
-- notify_<event>() function that:
--
--   1. self-authorizes the caller (it bypasses RLS, so it must check),
--   2. resolves the right recipients and applies their preferences,
--   3. applies the dedupe cooldown from 20260824100000,
--   4. inserts the in-app rows via INSERT ... ON CONFLICT DO NOTHING, and
--   5. RETURNs the payload for exactly the rows it inserted whose recipient
--      has email enabled.
--
-- Step 5's RETURNING set IS the outbox. lib/notifications/*.ts sends those
-- emails synchronously right after the RPC call returns, and nothing is ever
-- persisted as "pending" — which is how this milestone avoids the
-- event_outbox table the wider design corpus proposes but
-- docs/milestones/12-notifications-and-communications.md's Implementation
-- Notes explicitly forbid ("Do not introduce a message queue ... synchronous
-- delivery within the Server Action, with graceful failure handling, is
-- sufficient").
--
-- WHY EACH notify_*() FUNCTION IS ITS OWN TRANSACTION, CALLED AFTER THE
-- BUSINESS RPC COMMITS. record_inventory_movement(), execute_stock_transfer()
-- and create_sale() are never modified to call into this file. Doing the
-- notification work inside the business transaction — via a trigger or an
-- inline call — means any failure in it (a constraint, a lock wait on
-- notifications, a bad metadata cast) aborts the business operation. That is
-- exactly the correctness bug the milestone's Risks section names ("a sale
-- rollback because a receipt email failed"). Calling notify_low_stock()
-- separately, from lib/inventory/mutations.ts and lib/sales/mutations.ts,
-- after their own RPC has already committed, makes the isolation structural:
-- nothing this file does can roll back a movement, regardless of what fails.

-- ---------------------------------------------------------------------------
-- 1. resolve_notification_recipients — internal only, NEVER granted.
--
-- Resolves every active user in an organization who holds p_permission_key
-- at the given scope, joined against their notification_preferences row for
-- p_category (missing row = defaults, applied here via coalesce so
-- preferences are honoured BEFORE anything is written, never "insert then
-- filter").
--
-- WHY THIS RETURNS EMAIL ADDRESSES AND IS STILL SAFE TO LEAVE UNGRANTED:
-- users_select (20260822094400) already lets any org member read a
-- colleague's email via user_shares_org_with(), and
-- 20260822095000:23 already grants `select on public.users to authenticated`
-- — so this function discloses nothing a signed-in org member cannot already
-- read directly. It stays ungranted anyway as defense in depth and because a
-- "who holds permission X, and what is their email" oracle is a strictly
-- more convenient reconnaissance tool than the underlying table scan, even
-- if both are technically reachable by a determined caller. Only
-- notify_*() functions in this file may call it, via Postgres's normal
-- SECURITY DEFINER nesting (a definer function's own privileges apply to
-- calls it makes, regardless of the outer caller's grants).
create function public.resolve_notification_recipients(
  p_permission_key text,
  p_organization_id uuid,
  p_branch_id uuid default null,
  p_category text default null
)
returns table (
  user_id uuid,
  email text,
  full_name text,
  in_app_enabled boolean,
  email_enabled boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select distinct on (u.id)
    u.id,
    u.email,
    u.full_name,
    coalesce(np.in_app_enabled, true),
    coalesce(np.email_enabled, true)
  from public.user_roles ur
  join public.role_permissions rp on rp.role_id = ur.role_id
  join public.permissions p on p.id = rp.permission_id
  join public.users u on u.id = ur.user_id and u.deactivated_at is null
  left join public.notification_preferences np
    on np.user_id = u.id and np.category = p_category
  where p.key = p_permission_key
    and ur.organization_id = p_organization_id
    and (ur.branch_id is null or ur.branch_id = p_branch_id)
  order by u.id;
$$;

comment on function public.resolve_notification_recipients(text, uuid, uuid, text) is
  'Internal fan-out resolver for notify_*() functions. Never grant EXECUTE to '
  'authenticated — see the header comment in this migration for why leaving '
  'it ungranted is still correct even though the data itself is not new.';

-- ---------------------------------------------------------------------------
-- 2. create_user_notification — the shared, deduped insert helper. Internal
-- only, NEVER granted: granting it would let any org member write an
-- arbitrary title/message into a colleague's inbox next to real system
-- alerts — an in-app phishing primitive, and precisely what the milestone's
-- Security Requirement ("notification content is system-generated, not
-- user-supplied") forbids.
--
-- Returns the inserted id, or null when the cooldown/dedupe floor suppressed
-- the insert — callers use "id is not null" to decide whether to email.
create function public.create_user_notification(
  p_user_id uuid,
  p_organization_id uuid,
  p_category text,
  p_type text,
  p_title text,
  p_message text,
  p_href text,
  p_metadata jsonb,
  p_dedupe_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_dedupe_key is not null and exists (
    select 1 from public.notifications n
    where n.user_id = p_user_id
      and n.dedupe_key = p_dedupe_key
      and n.created_at > now() - interval '24 hours'
  ) then
    return null;
  end if;

  insert into public.notifications (
    user_id, organization_id, category, type, title, message, href, metadata, dedupe_key
  ) values (
    p_user_id, p_organization_id, p_category, p_type, p_title, p_message, p_href, p_metadata, p_dedupe_key
  )
  on conflict do nothing
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.create_user_notification(uuid, uuid, text, text, text, text, text, jsonb, text) is
  'Shared deduped insert. Never grant EXECUTE to authenticated — every '
  'notify_*() function calls this, but no application code may write a '
  'notification row directly. See the header comment in this migration.';

-- ---------------------------------------------------------------------------
-- 3. notify_low_stock — Milestone 07's low-stock condition, made real.
--
-- GUARD IS BRANCH ACCESS, NOT inventory.adjust. The highest-volume caller is
-- a cashier finishing a sale, and a cashier does not hold inventory.adjust —
-- guarding on it would make this function raise on every sale that happens
-- to drain a product below threshold, the caller would swallow that (see
-- lib/notifications/low-stock.ts: never throws), and the single
-- highest-volume event source would silently never fire. user_has_branch_access
-- is the right question here: "is the caller legitimately operating at this
-- branch at all", which every role from Cashier upward satisfies.
--
-- RECIPIENTS still resolve on inventory.adjust (branch-scoped) — the restock
-- authority, Owner + Branch Manager by default (supabase/seed.sql) — not
-- inventory.view, which would email every cashier on every branch.
--
-- STATE-BASED, NOT CROSSING-BASED. This function re-evaluates
-- "available_quantity <= low_stock_threshold" on demand rather than trying
-- to detect the moment a balance crosses its threshold. A crossing model
-- needs the before-value, which the caller does not have after its own RPC
-- has already committed; re-deriving it here would mean touching
-- record_inventory_movement() and reopening the correctness risk this file's
-- header explains away. State-based re-evaluation is idempotent (costs
-- nothing to re-check) and self-healing (a lost notification re-fires on the
-- next movement, where a crossing event is lost forever) — and the "storm"
-- objection to re-checking every time is what the 24-hour dedupe cooldown in
-- create_user_notification() exists to solve, which a crossing model would
-- need anyway for a product oscillating around its threshold.
create function public.notify_low_stock(
  p_branch_id uuid,
  p_product_ids uuid[]
)
returns table (
  notification_id uuid,
  user_id uuid,
  email text,
  full_name text,
  product_name text,
  sku text,
  branch_name text,
  quantity numeric,
  threshold numeric,
  href text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_branch_name text;
begin
  select b.organization_id, b.name into v_organization_id, v_branch_name
  from public.branches b
  where b.id = p_branch_id;

  if v_organization_id is null then
    raise exception 'branch % not found', p_branch_id using errcode = '02000';
  end if;

  if not public.user_has_branch_access(p_branch_id, v_organization_id) then
    raise exception 'not authorized for branch %', p_branch_id using errcode = '42501';
  end if;

  return query
  with candidates as (
    select
      ib.id as balance_id,
      ib.available_quantity,
      ib.low_stock_threshold,
      p.name as product_name,
      p.sku as sku
    from public.inventory_balances ib
    join public.products p on p.id = ib.product_id
    where ib.branch_id = p_branch_id
      and ib.low_stock_threshold is not null
      and ib.available_quantity <= ib.low_stock_threshold
      and (p_product_ids is null or ib.product_id = any(p_product_ids))
  ),
  recipients as (
    select r.* from public.resolve_notification_recipients(
      'inventory.adjust', v_organization_id, p_branch_id, 'inventory'
    ) r
    where r.in_app_enabled
  ),
  inserted as (
    select
      public.create_user_notification(
        rec.user_id,
        v_organization_id,
        'inventory',
        'inventory.low_stock',
        c.product_name || ' is low on stock',
        c.product_name || ' at ' || v_branch_name || ' has ' || c.available_quantity ||
          ' available, at or below its threshold of ' || c.low_stock_threshold || '.',
        '/inventory?branchId=' || p_branch_id,
        jsonb_build_object(
          'balanceId', c.balance_id,
          'branchId', p_branch_id,
          'quantity', c.available_quantity,
          'threshold', c.low_stock_threshold
        ),
        'inventory.low_stock:' || c.balance_id
      ) as id,
      rec.user_id,
      rec.email,
      rec.full_name,
      rec.email_enabled,
      c.product_name,
      c.sku,
      c.available_quantity,
      c.low_stock_threshold
    from candidates c
    cross join recipients rec
  )
  select
    i.id,
    i.user_id,
    i.email,
    i.full_name,
    i.product_name,
    i.sku,
    v_branch_name,
    i.available_quantity,
    i.low_stock_threshold,
    '/inventory?branchId=' || p_branch_id
  from inserted i
  where i.id is not null
    and i.email_enabled;
end;
$$;

comment on function public.notify_low_stock(uuid, uuid[]) is
  'Milestone 12''s realization of Milestone 07''s low-stock condition. '
  'Called from lib/inventory/mutations.ts and lib/sales/mutations.ts after '
  'their own RPC has committed. Guards on branch access (a cashier must be '
  'able to trigger this); recipients resolve on inventory.adjust (only the '
  'restock authority should be emailed). Returns only the rows it actually '
  'inserted (dedupe/cooldown may suppress a row) whose recipient has email '
  'enabled — that set is the caller''s email worklist.';

-- ---------------------------------------------------------------------------
-- 4. notify_role_assigned — the milestone's basic security trigger
-- ("role/permission changed"). Category security, which
-- notification_preferences' update policy (20260824100300) makes
-- non-disableable — a role change is exactly the kind of event the design
-- corpus (§15) means by "mandatory".
--
-- Guarded on roles.assign at the assignment's own organization: only someone
-- who could have performed the assignment may ask this function to announce
-- it, which matters because it is called from the same request that just
-- performed the assignment, by the same actor.
create function public.notify_role_assigned(
  p_user_role_id uuid
)
returns table (
  notification_id uuid,
  user_id uuid,
  email text,
  full_name text,
  role_name text,
  organization_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_user_id uuid;
  v_organization_id uuid;
  v_role_name text;
  v_organization_name text;
  v_target_email text;
  v_target_full_name text;
  v_email_enabled boolean;
  v_id uuid;
begin
  select ur.user_id, ur.organization_id, r.name, o.name
  into v_target_user_id, v_organization_id, v_role_name, v_organization_name
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  join public.organizations o on o.id = ur.organization_id
  where ur.id = p_user_role_id;

  if v_target_user_id is null then
    raise exception 'user_role % not found', p_user_role_id using errcode = '02000';
  end if;

  if not public.user_has_permission('roles.assign', v_organization_id) then
    raise exception 'not authorized for organization %', v_organization_id using errcode = '42501';
  end if;

  select u.email, u.full_name, coalesce(np.email_enabled, true)
  into v_target_email, v_target_full_name, v_email_enabled
  from public.users u
  left join public.notification_preferences np
    on np.user_id = u.id and np.category = 'security'
  where u.id = v_target_user_id;

  v_id := public.create_user_notification(
    v_target_user_id,
    v_organization_id,
    'security',
    'employee.role_changed',
    'Your role has changed',
    'You were assigned the ' || v_role_name || ' role in ' || v_organization_name || '.',
    '/settings/organization',
    jsonb_build_object('userRoleId', p_user_role_id, 'roleName', v_role_name),
    null -- role assignment is a discrete event, not a recurring condition;
         -- deduping it would hide a genuine second change.
  );

  return query
  select v_id, v_target_user_id, v_target_email, v_target_full_name, v_role_name, v_organization_name
  where v_id is not null and v_email_enabled;
end;
$$;

comment on function public.notify_role_assigned(uuid) is
  'The basic security trigger this milestone wires — full depth (suspicious '
  'activity, permission-change diffing) is Milestone 15''s scope. security '
  'category, non-disableable per 20260824100300''s update policy.';

-- ---------------------------------------------------------------------------
-- Grants: the two entry points authenticated code actually calls. Everything
-- above stays ungranted.
revoke execute on function public.resolve_notification_recipients(text, uuid, uuid, text) from public;
revoke execute on function public.create_user_notification(uuid, uuid, text, text, text, text, text, jsonb, text) from public;
revoke execute on function public.notify_low_stock(uuid, uuid[]) from public;
revoke execute on function public.notify_role_assigned(uuid) from public;

grant execute on function public.notify_low_stock(uuid, uuid[]) to authenticated;
grant execute on function public.notify_role_assigned(uuid) to authenticated;
