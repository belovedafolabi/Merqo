-- Coarse, per-category notification preferences, per the milestone's
-- Implementation Notes: "Keep notification preferences coarse (per-category,
-- not per-individual-event-type) unless a concrete need for finer
-- granularity emerges."
--
-- WHY THIS IS NOT THE EAV SETTINGS ENGINE docs/architecture/database-
-- conventions.md forbids (citing docs/TAS.md §9). EAV means an open key
-- space against an untyped value column. Here the attribute set is fixed and
-- typed — exactly two booleans — and `category` is a closed enumerated
-- domain fenced by a CHECK, not a free-text key. The alternative, one wide
-- row per user with inventory_email_enabled / security_email_enabled / ...,
-- is marginally more "typed" on paper but forces a table migration AND a UI
-- change every time a category is added — and Milestone 13 (billing) and
-- Milestone 15 (deeper security) each add one. Row-per-category costs one
-- LEFT JOIN and needs no migration when the catalogue in
-- lib/notifications/types.ts grows.
--
-- ROWS ARE CREATED LAZILY, NOT EAGERLY. There is no service-role client in
-- this codebase and no trigger on public.users that could seed default rows
-- at signup without duplicating the category list in SQL and needing a
-- backfill for every existing user. A missing row means "use the category's
-- default" — one coalesce() in resolve_notification_recipients() and one
-- merge in lib/notifications/queries.ts's read path. The preferences screen
-- upserts a row only when a user actually changes a default.
create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  category text not null check (category in ('inventory', 'administration', 'security', 'billing')),
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null
);

comment on table public.notification_preferences is
  'Per-user, per-category in-app/email toggle. One row per (user_id, '
  'category); a missing row means "use lib/notifications/types.ts''s default '
  'for that category". security and billing are mandatory (see the update '
  'policy in 20260824100300) and cannot be disabled through either channel.';

comment on column public.notification_preferences.category is
  'inventory | administration | security | billing — mirrors '
  'NotificationCategory in lib/notifications/types.ts and '
  'public.notifications.category. billing has no producer yet; seeded now so '
  'Milestone 13''s subscription-expiry warnings add zero schema.';

create unique index notification_preferences_user_category_key
  on public.notification_preferences (user_id, category);

-- Genuinely mutable user configuration, unlike notifications itself — the
-- shared trigger belongs here.
create trigger trg_notification_preferences_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;
