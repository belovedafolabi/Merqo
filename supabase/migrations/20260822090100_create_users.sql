-- Skeleton identity table (Milestone 02 scope: structure only).
--
-- Created before the Organization/Branch/Business Unit hierarchy purely so
-- `created_by` on every later table has a working FK target from day one.
-- No Supabase Auth wiring, no RLS policies, no session handling here — that's
-- Milestone 03's scope. This table is only ever touched via migrations/seeds
-- until Milestone 03 lands.
--
-- `id` is expected to be reconciled with `auth.users.id` once Milestone 03
-- wires up Supabase Auth (email/password sign-up creates the auth.users row;
-- this table's row is either the same id or 1:1-linked to it — Milestone 03's
-- design call, not this one).
create table public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null
);

-- Case-insensitive uniqueness on email.
create unique index users_email_key on public.users (lower(email));

create trigger trg_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- RLS enabled immediately, even though zero policies exist yet (default-deny).
-- See docs/architecture/database-conventions.md "RLS-enable-now, policy-later".
alter table public.users enable row level security;
