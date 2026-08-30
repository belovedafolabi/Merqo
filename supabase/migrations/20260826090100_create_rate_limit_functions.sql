-- The rate limiter's only access path to public.rate_limits
-- (20260826090000), per docs/milestones/15-security-qa-and-hardening.md's
-- rate-limiting scope. Thresholds are NOT baked in here: every caller passes
-- its own limit/window from lib/rate-limit/config.ts, so all five buckets'
-- tuning lives in one reviewable TypeScript table instead of being spread
-- across SQL function bodies. That is the one deliberate departure from
-- check_login_throttle()'s "constants in the function body" style
-- (20260822093400) — that function serves exactly one caller, this one
-- serves five.
--
-- Deliberately ONE function that both checks and records, rather than the
-- check_/record_ pair login throttling uses. Login needs the split because
-- it records an outcome the check doesn't count (a successful sign-in is
-- recorded but never counts toward the threshold). Rate limiting counts
-- every call, so check-and-insert can be a single atomic statement — which
-- also closes the time-of-check/time-of-use window two round trips would
-- leave open under concurrency, and halves the latency added to every
-- limited call.
create or replace function public.consume_rate_limit(
  p_bucket text,
  p_identifier text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window interval := make_interval(secs => p_window_seconds);
  v_count integer;
begin
  select count(*)
    into v_count
    from public.rate_limits
   where bucket = p_bucket
     and identifier = p_identifier
     and created_at > now() - v_window;

  -- Over the limit: return false WITHOUT inserting. Inserting here would
  -- let a client hammering the endpoint keep pushing its own window
  -- forward, so a sustained attack would never age out of its own
  -- lockout — punitive for an attacker, but it would also mean a
  -- misconfigured legitimate client could never recover on its own.
  if v_count >= p_limit then
    return false;
  end if;

  insert into public.rate_limits (bucket, identifier)
  values (p_bucket, p_identifier);

  -- Opportunistic prune, ~1 call in 100. Keeps the table bounded without a
  -- scheduled job: Milestone 13 owns the only cron primitive in the system
  -- (app/api/cron/subscriptions/route.ts), and adding a second scheduled
  -- surface for housekeeping this cheap is more infrastructure than the
  -- problem deserves. A day is far longer than the longest window any
  -- bucket uses (60 minutes), so this can never delete a row still being
  -- counted.
  if random() < 0.01 then
    delete from public.rate_limits
     where created_at < now() - interval '1 day';
  end if;

  return true;
end;
$$;

-- Read-only companion, so integration tests and the audit documentation can
-- observe a bucket's state without consuming a slot from it. Not used by
-- application code.
create or replace function public.rate_limit_count(
  p_bucket text,
  p_identifier text,
  p_window_seconds integer
)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::integer
  from public.rate_limits
  where bucket = p_bucket
    and identifier = p_identifier
    and created_at > now() - make_interval(secs => p_window_seconds);
$$;

revoke execute on function public.consume_rate_limit(text, text, integer, integer) from public;
revoke execute on function public.rate_limit_count(text, text, integer) from public;

-- anon as well as authenticated: the login, password-reset and pre-session
-- audit buckets all run before any session exists — the same deliberate
-- exception check_login_throttle() makes, for the same reason.
grant execute on function public.consume_rate_limit(text, text, integer, integer) to anon, authenticated;
-- authenticated only: the observation helper has no pre-session caller.
grant execute on function public.rate_limit_count(text, text, integer) to authenticated;
