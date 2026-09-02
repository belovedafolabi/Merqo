-- Whether this user has finished (or dismissed) the in-app product tour.
-- Nullable timestamp, mirroring organizations.onboarding_completed_at
-- (20260823090000): it only answers "has the tour run for this person",
-- which is what suppresses the auto-start on later sign-ins. The tour itself
-- can always be replayed from the user menu regardless of this value.
alter table public.users
  add column tour_completed_at timestamptz;

-- The write path. A SECURITY DEFINER RPC rather than a new RLS UPDATE policy
-- on public.users: the app's convention is that tenant tables are read under
-- RLS and written through narrow definer functions (see create_sale,
-- record_audit_event, mark_* helpers). This one can only ever stamp the
-- caller's own row, with now(), and nothing else.
create or replace function public.mark_tour_completed()
  returns void
  language sql
  security definer
  set search_path = public
as $$
  update public.users
  set tour_completed_at = now()
  where id = auth.uid();
$$;

revoke execute on function public.mark_tour_completed() from public;
grant execute on function public.mark_tour_completed() to authenticated;
