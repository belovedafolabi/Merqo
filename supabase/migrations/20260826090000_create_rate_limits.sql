-- Backs the general-purpose rate limiter
-- (docs/milestones/15-security-qa-and-hardening.md Scope: "Rate-limiting
-- review and tuning across sensitive endpoints (login, webhook, checkout)
-- beyond Milestone 03's basic login throttling"; Technical Requirements:
-- "implemented at a layer appropriate to the free-tier hosting... no paid
-- WAF/rate-limiting service introduced").
--
-- Postgres-backed rather than an in-process counter: the app runs on Vercel
-- serverless, where instances share no memory, so a per-instance counter is
-- not a limit at all — it is a limit divided by however many instances
-- happen to be warm. This table is the only shared state available at $0.
--
-- Generalizes public.login_attempts (20260822093200) rather than replacing
-- it. The two are deliberately separate: login_attempts records the
-- *outcome* of a sign-in (only failures count toward its threshold, so a
-- legitimate user is never locked out by their own successful logins),
-- while this table counts *every* call regardless of outcome. Collapsing
-- them would force one of those two semantics onto the other.
--
-- `bucket` names the limited surface ('login', 'login_reset', 'webhook',
-- 'checkout', 'auth_audit'); `identifier` is the key being limited within
-- that bucket, and its meaning is per-bucket — see lib/rate-limit/config.ts,
-- which is the single place thresholds and key choices are declared.
--
-- Deliberately not exposed via any GRANT and RLS-enabled with zero
-- policies: the only access path is the SECURITY DEFINER functions in
-- 20260826090100_create_rate_limit_functions.sql. Same posture as
-- login_attempts, for the same reason — a client that could read this table
-- could enumerate which identifiers are near their limit.
create table public.rate_limits (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  identifier text not null,
  created_at timestamptz not null default now()
);

-- The lookup every consume_rate_limit() call makes: count rows in one
-- bucket for one identifier inside a trailing window.
create index rate_limits_bucket_identifier_created_at_idx
  on public.rate_limits (bucket, identifier, created_at desc);

-- Supports the opportunistic prune inside consume_rate_limit(), which
-- deletes by age across all buckets.
create index rate_limits_created_at_idx
  on public.rate_limits (created_at);

alter table public.rate_limits enable row level security;
