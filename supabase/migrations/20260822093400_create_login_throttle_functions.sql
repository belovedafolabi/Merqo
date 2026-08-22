-- Basic brute-force protection (docs/milestones/03-authentication-and-rbac-foundation.md
-- Scope). Threshold/window are intentionally simple constants baked into the
-- function body rather than a configurable settings table — this is
-- infrastructure hardening, not a business setting a client should be able
-- to tune (see docs/TAS.md §9's warning against over-configuring).
--
-- These run pre-session (a sign-in attempt has no auth.uid() yet), so they
-- are the one deliberate exception to "every RPC requires an authenticated
-- caller": granted to anon as well as authenticated.
create or replace function public.check_login_throttle(p_identifier text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select count(*) >= 5
  from public.login_attempts
  where identifier = lower(p_identifier)
    and succeeded = false
    and created_at > now() - interval '15 minutes';
$$;

create or replace function public.record_login_attempt(
  p_identifier text,
  p_ip_address inet,
  p_succeeded boolean
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.login_attempts (identifier, ip_address, succeeded)
  values (lower(p_identifier), p_ip_address, p_succeeded);
$$;

revoke execute on function public.check_login_throttle(text) from public;
revoke execute on function public.record_login_attempt(text, inet, boolean) from public;

grant execute on function public.check_login_throttle(text) to anon, authenticated;
grant execute on function public.record_login_attempt(text, inet, boolean) to anon, authenticated;
