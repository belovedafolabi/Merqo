-- Make the Overview trend chart's day buckets the business's local calendar
-- days, not the server's UTC days.
--
-- =============================================================================
-- WHY
-- =============================================================================
-- 20260903090300's dashboard_sales_series() buckets sales with a bare
-- `date_trunc('day', ...)`, which runs on the server session's time zone (UTC
-- on this platform). A Lagos shop (WAT, UTC+01:00) then sees each "day" drawn
-- as roughly 01:00→01:00 — an hour of every evening's takings lands on the
-- next day's bar, and a quiet hour after midnight can invent activity on a day
-- the shop was shut. lib/dashboard/summary.ts now passes an explicit IANA zone
-- so the buckets line up with the calendar the shopkeeper actually keeps.
--
-- The 3-arg function is DROPPED and replaced with a 4-arg one (a defaulted
-- `p_tz`) rather than adding an overload — one canonical signature, one grant.
-- dashboard_sales_series() has exactly one caller (lib/dashboard/summary.ts),
-- updated in the same change. dashboard_sales_summary() is untouched: it only
-- sums between two caller-supplied instants and never buckets by day, so it
-- has no time-zone dependency to fix.
--
-- Africa/Lagos has no daylight saving, so stepping the series with
-- `+ interval '1 day'` on timestamptz is always exactly one local day; a zone
-- with DST would need `+ interval '1 day'` applied to the local timestamp
-- instead. Revisit alongside DASHBOARD_TIME_ZONE in lib/dashboard/periods.ts
-- if a client outside WAT is ever onboarded.

drop function if exists public.dashboard_sales_series(uuid, timestamptz, timestamptz);

create function public.dashboard_sales_series(
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_tz text default 'UTC'
)
returns table (
  day date,
  sale_count bigint,
  net_sales numeric
)
language sql
security invoker
stable
set search_path = public
as $$
  select
    (d.bucket at time zone p_tz)::date as day,
    count(s.id),
    coalesce(sum(s.subtotal - s.discount_amount), 0)
  from generate_series(
         date_trunc('day', p_from at time zone p_tz) at time zone p_tz,
         date_trunc('day', (p_to - interval '1 microsecond') at time zone p_tz) at time zone p_tz,
         interval '1 day'
       ) as d(bucket)
  left join public.sales s
    on s.branch_id = p_branch_id
   and s.created_at >= d.bucket
   and s.created_at < d.bucket + interval '1 day'
  group by d.bucket
  order by d.bucket;
$$;

revoke execute on function public.dashboard_sales_series(uuid, timestamptz, timestamptz, text) from public;
grant execute on function public.dashboard_sales_series(uuid, timestamptz, timestamptz, text) to authenticated;
