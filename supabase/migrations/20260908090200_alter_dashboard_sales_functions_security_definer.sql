-- Same class of bug as 20260908090100 (pos_product_shortcuts), same fix.
--
-- dashboard_sales_summary() and dashboard_sales_series() were SECURITY
-- INVOKER, so the per-row sales_select RLS `using` clause
-- (EXISTS on user_has_permission('sales.view', ...)) was re-evaluated for
-- every sales row they scan. Each runs ~2s over ~2000 sales as an
-- authenticated user vs ~0.3s as service_role. That was survivable until a
-- user enabled the "Sales performance" dashboard widget, whose loadPerformance()
-- (app/(app)/dashboard/page.tsx) fires four periods x {summary, series} = 8 of
-- these concurrently, alongside the page's ~6 other queries. ~14 at once on a
-- small instance push each past the 8s statement_timeout -> "canceling
-- statement due to statement timeout" -> the /dashboard RSC render throws
-- (React #441, "Something went wrong").
--
-- Flip both to SECURITY DEFINER with one upfront branch-membership check
-- (user_has_branch_access()'s body, inlined so no org-id parameter is
-- needed). Bodies are otherwise verbatim; both were already hard-filtered to
-- p_branch_id, so a caller who can't reach the branch gets an empty result,
-- never another branch's numbers.

-- ---------------------------------------------------------------------------
-- dashboard_sales_summary — verbatim from 20260903090300 except the guard.
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_sales_summary(
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  sale_count bigint,
  gross_sales numeric,
  net_sales numeric,
  collected numeric,
  average_sale numeric,
  prior_sale_count bigint,
  prior_net_sales numeric,
  prior_average_sale numeric
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
  with bounds as (
    select
      p_from as from_at,
      p_to as to_at,
      -- Same duration, immediately preceding. Derived rather than passed in so
      -- the two windows cannot drift apart.
      p_from - (p_to - p_from) as prior_from_at
  ),
  windowed as (
    select
      -- `current` and `prior` in one pass over one index range, rather than
      -- two scans of the same table.
      s.created_at >= (select from_at from bounds) as is_current,
      s.subtotal,
      s.discount_amount,
      s.total
    from public.sales s, bounds b
    where s.branch_id = p_branch_id
      and s.created_at >= b.prior_from_at
      and s.created_at < b.to_at
  ),
  agg as (
    select
      count(*) filter (where is_current) as cur_count,
      coalesce(sum(subtotal) filter (where is_current), 0) as cur_gross,
      coalesce(sum(subtotal - discount_amount) filter (where is_current), 0) as cur_net,
      coalesce(sum(total) filter (where is_current), 0) as cur_collected,
      count(*) filter (where not is_current) as prior_count,
      coalesce(sum(subtotal - discount_amount) filter (where not is_current), 0) as prior_net
    from windowed
  )
  select
    cur_count,
    cur_gross,
    cur_net,
    cur_collected,
    -- Explicit zero rather than a division by zero on a day with no sales.
    case when cur_count = 0 then 0 else cur_net / cur_count end,
    prior_count,
    prior_net,
    case when prior_count = 0 then 0 else prior_net / prior_count end
  from agg;
end;
$$;

revoke execute on function public.dashboard_sales_summary(uuid, timestamptz, timestamptz) from public;
grant execute on function public.dashboard_sales_summary(uuid, timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- dashboard_sales_series — verbatim from 20260904090100 except the guard.
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_sales_series(
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
end;
$$;

revoke execute on function public.dashboard_sales_series(uuid, timestamptz, timestamptz, text) from public;
grant execute on function public.dashboard_sales_series(uuid, timestamptz, timestamptz, text) to authenticated;
