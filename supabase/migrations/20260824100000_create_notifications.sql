-- The in-app notification inbox, per docs/TAS.md §32 and
-- docs/milestones/12-notifications-and-communications.md's Database Changes
-- ("user_id, type, title, message, read_at, created_at, optionally metadata
-- for linking back to the triggering resource").
--
-- NO INSERT PATH FROM THE APPLICATION. There is no insert policy and no
-- insert grant (see 20260824100100 and 20260824100500). Every row is written
-- by a SECURITY DEFINER notify_*() function in 20260824100400. That is what
-- makes the milestone's Security Requirement — "notification content is
-- treated as system-generated, not user-supplied" — true at the database
-- level rather than by convention. A user who can compose the title and body
-- of a row that lands in a colleague's inbox, next to real system alerts,
-- has an in-app phishing primitive; closing it in SQL means no future Server
-- Action can reopen it by accident.
--
-- WHY organization_id, when user_id already identifies the recipient.
-- user_roles is per-organization, so one person can hold roles in two
-- organizations. Without this column a low-stock alert from organization A
-- would surface in the bell while the user is working in organization B —
-- correct by ownership, wrong by context. The bell and the inbox both filter
-- on the caller's current organization.
--
-- WHY THERE IS NO updated_at, NO created_by, AND NO set_updated_at TRIGGER.
-- This is a deliberate departure from docs/architecture/database-conventions.md
-- and it should stay departed. The table is append-only except for read_at,
-- so updated_at could only ever duplicate read_at, and the shared trigger
-- would fire on the single hottest write path this table has (mark-as-read)
-- to maintain a column nothing reads. created_by is equally meaningless: the
-- author is always the system. The conventions doc records this exception.
--
-- WHY THERE IS NO priority COLUMN. The design corpus (§13) proposes
-- INFO/WARNING/IMPORTANT/CRITICAL. Nothing in Milestone 12 renders
-- differently per priority — all three shipped types are the same urgency,
-- and `category` already carries the only distinction the UI draws. A column
-- that is written but never read is a lie in the schema. If Milestone 15's
-- security work needs it, `add column priority text not null default 'INFO'`
-- is purely additive with no backfill problem.
--
-- RETENTION IS MILESTONE 13's. The design corpus (§43) wants read
-- notifications swept after ~90 days. Doing it here would mean inventing this
-- application's first scheduled-execution surface — a cron Route Handler, a
-- CRON_SECRET, and a privileged delete path — for a table that holds a few
-- thousand rows after a year. Milestone 13 needs that scheduler anyway for
-- subscription expiry warnings; the sweep is three lines added to a handler
-- that will already exist. No retention index is created here, because
-- nothing sweeps yet and an index nothing uses is cost without benefit.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  category text not null check (category in ('inventory', 'administration', 'security', 'billing')),
  type text not null,
  title text not null,
  message text not null,
  href text,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.notifications is
  'Per-user in-app notification inbox. Append-only except for read_at. '
  'Written exclusively by the SECURITY DEFINER notify_*() functions in '
  '20260824100400 — there is deliberately no insert policy or grant. '
  'Retention (read rows older than ~90 days) is deferred to Milestone 13, '
  'which owns the scheduled-execution primitive.';

comment on column public.notifications.category is
  'Coarse grouping that notification_preferences toggles against. Kept '
  'deliberately coarse (per-category, not per-type) per the milestone''s '
  'Implementation Notes.';

comment on column public.notifications.type is
  'The specific event, e.g. inventory.low_stock. Mirrors NotificationType in '
  'lib/notifications/types.ts, which is the single catalogue mapping a type '
  'to its category and email template.';

comment on column public.notifications.href is
  'Optional app-relative deep link to the triggering resource. Rendered only '
  'when it starts with "/" — system-generated, but validated at render '
  'rather than trusted, and unwritable by the recipient because the grant in '
  '20260824100500 restricts UPDATE to read_at alone.';

comment on column public.notifications.dedupe_key is
  'Stable identity of the underlying CONDITION, not of this row — e.g. '
  '"inventory.low_stock:<balance_id>". Null means "never deduplicate". See '
  'the two indexes below.';

-- Bell: unread count for one user in one organization. Partial, because the
-- read rows it excludes are the ones that accumulate.
create index notifications_user_unread_idx
  on public.notifications (user_id, organization_id, created_at desc)
  where read_at is null;

-- Inbox: the newest N for one user in one organization, read and unread.
create index notifications_user_created_idx
  on public.notifications (user_id, organization_id, created_at desc);

-- Supports the 24-hour cooldown predicate in notify_low_stock().
create index notifications_user_dedupe_key_idx
  on public.notifications (user_id, dedupe_key, created_at desc)
  where dedupe_key is not null;

-- The concurrency floor under that cooldown: at most one notification per
-- (user, condition) per UTC day, enforced by the database rather than by a
-- read-then-write race between two concurrent stock movements.
--
-- The cooldown predicate and this index are BOTH needed and neither replaces
-- the other. A unique index alone would suppress the alert permanently, so
-- after restocking and re-depleting you would never be told again — the
-- condition recurs, and a constraint cannot express "recurs after a while".
-- A predicate alone loses a race between two simultaneous sales of the same
-- product. Together: the predicate is the tunable policy, the index turns a
-- lost race into a swallowed ON CONFLICT rather than a duplicate.
--
-- `created_at at time zone 'UTC'` is load-bearing. A plain `created_at::date`
-- cast is NOT immutable (timestamptz -> date depends on the session's
-- TimeZone setting) and Postgres rejects it in an index expression outright.
create unique index notifications_dedupe_key_daily_key
  on public.notifications (user_id, dedupe_key, (date_trunc('day', created_at at time zone 'UTC')))
  where dedupe_key is not null;

alter table public.notifications enable row level security;
