-- The Admin dashboard's sales figures.
--
-- =============================================================================
-- WHY THIS EXISTS AT ALL
-- =============================================================================
-- The dashboard's three stat cards and its "Sales overview" chart have been
-- hardcoded since Milestone 04: literal "₦0" strings and an EmptyState reading
-- "Charts populate once the POS Transaction Engine (Milestone 08) starts
-- recording sales." Milestone 08 shipped, sales have been recording correctly
-- ever since, and nothing was ever wired up — so a live shop rings up real
-- money and its dashboard still reports zero. That is the bug this closes; the
-- sales data itself was never wrong.
--
-- =============================================================================
-- WHY NOT report_sales_by_scope()
-- =============================================================================
-- Same reason as 20260903090100: lib/reports/queries.ts gates every standard
-- report on `reports.view`, and the dashboard is the landing page for every
-- signed-in user. Routing it through the reporting stack would blank the
-- landing page for anyone without reporting permission. These two functions
-- are narrower — one branch, one period, no grouping, no cost or margin
-- columns — so they can be granted to `authenticated` without handing out
-- anything `reports.view` protects.
--
-- =============================================================================
-- MONEY SEMANTICS
-- =============================================================================
-- Follows 20260823141000's header exactly, so the dashboard can never
-- contradict the Reports module for the same period:
--
--   gross_sales = Σ sales.subtotal      (already net of per-line discounts)
--   net_sales   = Σ (subtotal − discount_amount)   ← the revenue figure
--   collected   = Σ sales.total          (what actually went in the till)
--
-- Tax and service charge are collected on behalf of others and are never
-- revenue (docs/Financial_Architecture_Accounting_Reconciliation.md §29–30),
-- which is why `collected` is reported separately rather than being called
-- sales.
--
-- SECURITY INVOKER, per 20260823141000's header: sales_select already scopes
-- rows to the branches the caller can reach.
--
-- No new index: sales_branch_id_idx (branch_id, created_at desc) from
-- 20260823120000 serves both the window and the comparison window.

-- The three stat cards. Returns the requested window AND the equally-long
-- window immediately before it, because every card renders a "vs. yesterday"
-- delta and computing the comparison in a second round trip would let the two
-- windows be measured against different clocks.
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
language sql
security invoker
stable
set search_path = public
as $$
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
$$;

-- The "Sales overview" chart. One row per day in the window, including days
-- with no sales at all — a gap in a time series must be drawn as a zero, not
-- silently closed up, or a quiet Sunday reads as though it never happened.
--
-- Days are session-timezone days, via a bare date_trunc('day', ...) — the same
-- idiom report_sales_by_scope() uses for its 'day' grouping. Matching it is the
-- point: a dashboard whose day boundaries disagreed with the sales report's
-- would show two different numbers for "yesterday" and there would be no way
-- to tell which one was lying.
create or replace function public.dashboard_sales_series(
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz
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
    d.day::date,
    count(s.id),
    coalesce(sum(s.subtotal - s.discount_amount), 0)
  from generate_series(
         date_trunc('day', p_from),
         date_trunc('day', p_to - interval '1 microsecond'),
         interval '1 day'
       ) as d(day)
  left join public.sales s
    on s.branch_id = p_branch_id
   and s.created_at >= d.day
   and s.created_at < d.day + interval '1 day'
  group by d.day
  order by d.day;
$$;

-- Explicit privileges, per 20260826090500's header.
revoke execute on function public.dashboard_sales_summary(uuid, timestamptz, timestamptz) from public;
grant execute on function public.dashboard_sales_summary(uuid, timestamptz, timestamptz) to authenticated;

revoke execute on function public.dashboard_sales_series(uuid, timestamptz, timestamptz) from public;
grant execute on function public.dashboard_sales_series(uuid, timestamptz, timestamptz) to authenticated;
