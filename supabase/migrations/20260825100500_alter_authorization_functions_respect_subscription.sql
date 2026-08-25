-- The subscription-lock enforcement boundary
-- (docs/milestones/13-subscription-billing-and-platform-admin.md Technical
-- Requirements: "Subscription-lock check integrated into the
-- authentication/session layer built in Milestone 03 — the hook point
-- stubbed there is now implemented").
--
-- This migration is the exact structural mirror of
-- 20260824090100_alter_authorization_functions_respect_deactivation.sql,
-- which already solved this problem for a different predicate
-- (deactivated_at). That file's own header states the principle this one
-- reuses verbatim: "A JWT was never the authorization in this schema — it
-- only establishes auth.uid(). Gate the shared authorization functions on a
-- live predicate and an already-issued, still-unexpired access token yields
-- zero permission grants the instant that predicate flips." No session-
-- revocation mechanism is built here, for the same reason none was built for
-- deactivation: RLS re-evaluates the predicate on every query, so there is
-- nothing to revoke.
create or replace function public.organization_access_permitted(p_organization_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.user_is_platform_admin()
      or not exists (
        select 1 from public.subscriptions s
        where s.organization_id = p_organization_id
          and s.current_period_end <= now()
      );
$$;

comment on function public.organization_access_permitted(uuid) is
  'The subscription-lock predicate. Three deliberate choices: '
  '(1) reads subscriptions.current_period_end directly, NOT the '
  'subscriptions.status column that run_subscription_daily_sweep() only '
  'refreshes once a day — gating on status would make the lock up to 24 '
  'hours late. (2) fails OPEN (returns true) when no subscriptions row '
  'exists for the organization: 20260825101000 guarantees every '
  'organization has one, so this branch should be unreachable in practice — '
  'it exists so a migration-ordering mistake degrades to "billing not yet '
  'enforced" rather than locking out a live deployment''s every user. '
  '(3) the Super Admin exemption (user_is_platform_admin()) lives HERE and '
  'ONLY here — grep platform.override and this function plus '
  'user_is_platform_admin() itself are the only two hits.';

revoke execute on function public.organization_access_permitted(uuid) from public;
grant execute on function public.organization_access_permitted(uuid) to authenticated;

-- The six functions below are re-created verbatim from
-- 20260824090100_alter_authorization_functions_respect_deactivation.sql with
-- one added conjunct: organization_access_permitted(). Their deactivation-era
-- comments are not duplicated here — see that file.
create or replace function public.user_has_org_access(p_organization_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.user_is_active()
     and public.organization_access_permitted(p_organization_id)
     and exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.organization_id = p_organization_id
  );
$$;

create or replace function public.user_has_branch_access(p_branch_id uuid, p_organization_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.user_is_active()
     and public.organization_access_permitted(p_organization_id)
     and exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.organization_id = p_organization_id
      and (ur.branch_id is null or ur.branch_id = p_branch_id)
  );
$$;

create or replace function public.user_has_business_unit_access(p_business_unit_id uuid, p_branch_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.user_is_active()
     and public.organization_access_permitted(
       (select organization_id from public.branches where id = p_branch_id)
     )
     and exists (
    select 1 from public.user_roles ur
    join public.branches b on b.id = p_branch_id
    where ur.user_id = auth.uid()
      and ur.organization_id = b.organization_id
      and (ur.branch_id is null or ur.branch_id = p_branch_id)
      and (ur.business_unit_id is null or ur.business_unit_id = p_business_unit_id)
  );
$$;

create or replace function public.user_shares_org_with(p_target_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.user_is_active() and exists (
    select 1
    from public.user_roles mine
    join public.user_roles theirs
      on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid()
      and theirs.user_id = p_target_user_id
      and public.organization_access_permitted(mine.organization_id)
  );
$$;

-- The single most important one, per the deactivation precedent's own
-- comment: a locked caller resolves to (near-)zero grants, so
-- lib/auth/context.ts's getCurrentOrganizationId() (grants[0]) still finds
-- an organization, but every requirePermission() beyond subscription.view /
-- subscription.renew throws.
--
-- The `or p.key in (...)` clause is NOT a hole in the lock — it is the whole
-- design. Without it, a locked Owner would have zero grants, therefore no
-- organization id (getCurrentOrganizationId() reads grants[0]), and
-- therefore could not even render the renew screen or pay to unlock their
-- own organization. Preserving exactly these two keys leaves them an
-- identity and a renew path; every other requirePermission() call and every
-- business-table RLS policy (which does not carry this carve-out) still
-- denies them.
create or replace function public.current_user_permission_grants()
returns table (
  permission_key text,
  organization_id uuid,
  branch_id uuid,
  business_unit_id uuid
)
language sql
security definer
stable
set search_path = public
as $$
  select distinct p.key, ur.organization_id, ur.branch_id, ur.business_unit_id
  from public.user_roles ur
  join public.role_permissions rp on rp.role_id = ur.role_id
  join public.permissions p on p.id = rp.permission_id
  where ur.user_id = auth.uid()
    and public.user_is_active()
    and (
      public.organization_access_permitted(ur.organization_id)
      or p.key in ('subscription.view', 'subscription.renew')
    );
$$;

-- Reads current_user_permission_grants(), so it is already covered
-- transitively; the explicit conjunct is kept so this function is correct
-- read in isolation, matching the deactivation migration's own stated
-- standard. Unlike current_user_permission_grants(), this one does NOT carry
-- the subscription.* carve-out — a locked user calling
-- user_has_permission('subscription.renew', org) directly still needs the
-- lock check to pass, which it does via organization_access_permitted().
-- The carve-out only ever needs to exist in the grants LIST so the frontend
-- can discover what a locked user is still allowed to do.
create or replace function public.user_has_permission(
  p_permission_key text,
  p_organization_id uuid,
  p_branch_id uuid default null,
  p_business_unit_id uuid default null
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.user_is_active()
     and (
       public.organization_access_permitted(p_organization_id)
       or p_permission_key in ('subscription.view', 'subscription.renew')
     )
     and exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = auth.uid()
      and ur.organization_id = p_organization_id
      and p.key = p_permission_key
      and (ur.branch_id is null or ur.branch_id = p_branch_id)
      and (ur.business_unit_id is null or ur.business_unit_id = p_business_unit_id)
  );
$$;

-- The single shared read every locked-out surface (proxy.ts, signIn(), the
-- expiry banner, and the locked screen) uses. Deliberately does NOT resolve
-- its own organization via any of the functions above — every one of them is
-- now lock-gated, and a locked screen that depends on a lock-gated read to
-- render itself is a blank page, not a locked screen.
create or replace function public.subscription_access_state()
returns table (
  organization_id uuid,
  organization_name text,
  status text,
  billing_period text,
  current_period_end timestamptz,
  days_remaining integer,
  price_minor bigint,
  currency text,
  locked boolean,
  can_renew boolean,
  is_platform_admin boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select
    o.id,
    o.name,
    s.status,
    s.billing_period,
    s.current_period_end,
    ceil(extract(epoch from (s.current_period_end - now())) / 86400)::int,
    s.price_minor,
    s.currency,
    (s.current_period_end <= now()) and not public.user_is_platform_admin(),
    exists (
      select 1
      from public.user_roles ur2
      join public.role_permissions rp on rp.role_id = ur2.role_id
      join public.permissions p on p.id = rp.permission_id
      where ur2.user_id = auth.uid()
        and ur2.organization_id = o.id
        and p.key = 'subscription.renew'
    ),
    public.user_is_platform_admin()
  from public.user_roles ur
  join public.organizations o on o.id = ur.organization_id
  left join public.subscriptions s on s.organization_id = o.id
  where ur.user_id = auth.uid()
    and public.user_is_active()
  limit 1;
$$;

comment on function public.subscription_access_state() is
  'The single RPC proxy.ts, signIn(), the expiry banner, and the locked '
  'screen all share. Resolves the caller''s organization via a direct '
  'user_roles/organizations join, never through a lock-gated function, so it '
  'stays readable by a locked-out user. locked=true only for a non-platform-'
  'admin whose subscription has passed current_period_end.';

revoke execute on function public.subscription_access_state() from public;
grant execute on function public.subscription_access_state() to authenticated;
