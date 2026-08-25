-- Milestone 13's Super Admin-configurable price list
-- (docs/milestones/13-subscription-billing-and-platform-admin.md Database
-- Changes: "subscription_pricing (Super Admin-configurable price per
-- duration)"). Deliberately GLOBAL, not organization-scoped: per
-- DECISIONS_AND_CONFLICTS.md §5 (resolved), Super Admin configures *this
-- single-tenant deployment's* own pricing, not a per-client price list — one
-- row per duration, period.
--
-- `billing_period` is `text + check`, not a native Postgres enum, matching
-- `notifications.category`'s own precedent — a future fifth duration is an
-- `alter table ... drop/add constraint`, not an `alter type` migration that
-- cannot run inside a transaction block on older Postgres.
--
-- `price_minor` is an integer in the currency's minor unit (kobo for NGN),
-- never numeric/float. This is the unit Paystack's Initialize Transaction API
-- itself accepts and returns, so storing anything else would mean a lossy
-- conversion on every read and write.
create table public.subscription_pricing (
  id uuid primary key default gen_random_uuid(),
  billing_period text not null unique
    check (billing_period in ('MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL')),
  price_minor bigint not null check (price_minor >= 0),
  currency text not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  is_active boolean not null default true,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.subscription_pricing is
  'Global price list for this deployment''s own subscription, one row per '
  'billing_period. Written only via set_subscription_price() '
  '(20260825100600), which enforces the platform.manage_pricing permission '
  '— see 20260825100800 for the no-write-policy stance this mirrors.';

comment on column public.subscription_pricing.currency is
  'A column, not a hardcoded assumption, even though NGN is the only value '
  'seeded today — the spec never rules out a future currency and hardcoding '
  'it into column semantics would be the expensive mistake to reverse.';

create trigger subscription_pricing_set_updated_at
  before update on public.subscription_pricing
  for each row execute function public.set_updated_at();

alter table public.subscription_pricing enable row level security;
