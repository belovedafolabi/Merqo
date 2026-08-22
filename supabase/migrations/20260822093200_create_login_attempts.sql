-- Backs login throttling (docs/milestones/03-authentication-and-rbac-foundation.md
-- Scope: "basic brute-force protection"). `identifier` is the lowercased
-- email a sign-in was attempted with — recorded even for emails that don't
-- exist, so an attacker can't distinguish "wrong password" from "no such
-- account" by throttle behavior.
--
-- Deliberately not exposed via any GRANT: the only access path is the
-- SECURITY DEFINER functions in
-- 20260822093400_create_login_throttle_functions.sql. RLS is enabled with
-- zero policies as defense-in-depth even though the function route is
-- already the sole path in — see docs/architecture/database-conventions.md
-- "RLS-enable-now, policy-later".
create table public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  ip_address inet,
  succeeded boolean not null,
  created_at timestamptz not null default now()
);

create index login_attempts_identifier_created_at_idx
  on public.login_attempts (identifier, created_at desc);

alter table public.login_attempts enable row level security;
