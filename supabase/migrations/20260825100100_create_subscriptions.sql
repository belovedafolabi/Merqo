-- The organization-level subscription record
-- (docs/milestones/13-subscription-billing-and-platform-admin.md Scope:
-- "Subscription model: organization-level (not per-branch/per-business-unit),
-- plan, billing period ..., price, start/end date, status").
--
-- `organization_id` is UNIQUE: exactly one subscription per organization,
-- always. This turns "which subscription do we extend on a successful
-- payment?" from a query into a foreign-key lookup, and makes double-
-- provisioning a constraint violation rather than a bug to detect later.
--
-- `status` is a DISPLAY value only, refreshed once a day by
-- run_subscription_daily_sweep() (20260825100700). It is deliberately NOT
-- what the subscription lock reads — 20260825100500's
-- organization_access_permitted() reads current_period_end directly, so
-- enforcement is exact to the second rather than up to 24 hours stale.
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,

  billing_period text not null
    check (billing_period in ('MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL')),
  price_minor bigint not null check (price_minor >= 0),
  currency text not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),

  current_period_start timestamptz not null,
  current_period_end timestamptz not null,

  status text not null check (status in ('ACTIVE', 'EXPIRING', 'EXPIRED')),
  is_trial boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint subscriptions_period_order check (current_period_end > current_period_start)
);

comment on column public.subscriptions.status is
  'A materialized display value refreshed daily by '
  'run_subscription_daily_sweep(). NOT the enforcement boundary — see '
  'organization_access_permitted() in 20260825100500, which reads '
  'current_period_end directly so the lock takes effect to the second.';

comment on column public.subscriptions.is_trial is
  'True for the 14-day trial period created_organization_with_owner() '
  '(20260825101000) grants every new organization. Not itself checked by '
  'the lock — a trial is simply a subscription with price_minor = 0 whose '
  'period eventually ends like any other.';

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Drives run_subscription_daily_sweep()'s scan for approaching/passed
-- expiry without touching already-expired-and-processed rows every day.
create index subscriptions_expiry_idx
  on public.subscriptions (current_period_end)
  where status <> 'EXPIRED';

alter table public.subscriptions enable row level security;
