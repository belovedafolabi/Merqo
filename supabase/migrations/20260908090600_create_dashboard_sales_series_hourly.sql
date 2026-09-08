-- Milestone 17 Part E item 3: the "Sales performance" card's "Today" tab must
-- chart the day by the hour, not fourteen trailing days.
--
-- dashboard_sales_series() buckets by calendar day and returns `day date`, so
-- it can't express an hourly series. This is its hourly sibling: same shape,
-- same money semantics (net = subtotal - discount_amount), same
-- generate_series LEFT JOIN so an hour with no sales still emits a zero row,
-- and the same SECURITY DEFINER + inlined branch-membership guard that
-- 20260908090200 added (per-row sales_select RLS re-evaluation was pushing the
-- INVOKER versions past the 8s statement_timeout once the performance widget
-- fired eight of them at once).
--
-- loadPerformance() (app/(app)/dashboard/page.tsx) swaps this in *instead of*
-- the daily series for the "today" slot, so the concurrent-RPC count per page
-- load is unchanged.

create or replace function public.dashboard_sales_series_hourly(
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_tz text default 'UTC'
)
returns table (
  bucket timestamptz,
  sale_count bigint,
  net_sales numeric
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.user_roles ur
    join public.branches b on b.organization_id = ur.organization_id
    where b.id = p_branch_id
      and ur.user_id = auth.uid()
      and (ur.branch_id is null or ur.branch_id = p_branch_id)
  ) then
    return;
  end if;

  return query
  select
    d.bucket,
    count(s.id),
    coalesce(sum(s.subtotal - s.discount_amount), 0)
  from generate_series(
         date_trunc('hour', p_from at time zone p_tz) at time zone p_tz,
         date_trunc('hour', (p_to - interval '1 microsecond') at time zone p_tz) at time zone p_tz,
         interval '1 hour'
       ) as d(bucket)
  left join public.sales s
    on s.branch_id = p_branch_id
   and s.created_at >= d.bucket
   and s.created_at < d.bucket + interval '1 hour'
  group by d.bucket
  order by d.bucket;
end;
$$;

revoke execute on function public.dashboard_sales_series_hourly(uuid, timestamptz, timestamptz, text)
  from public;
grant execute on function public.dashboard_sales_series_hourly(uuid, timestamptz, timestamptz, text)
  to authenticated;
