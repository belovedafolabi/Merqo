-- Milestone 17 Part A — the on-demand insight computation.
--
-- =============================================================================
-- WHAT IT DOES
-- =============================================================================
-- Given a business unit, computes three things from public.sales /
-- public.sale_items / public.inventory_balances and upserts the three
-- sales_insights_cache rows (20260905090200):
--
--   forecast    — per-product demand for next day / next 7 days / next 30 days,
--                 with a trend chip and a confidence signal
--   restock     — products whose days-of-cover is below the org threshold, with
--                 a suggested order quantity
--   slow_movers — stocked-but-unsold products, ranked by retail value tied up
--
-- Explicitly NOT machine learning: every number is a SQL aggregate plus
-- arithmetic (docs/milestones/17-post-launch-enhancements.md Part A).
--
-- =============================================================================
-- FORECAST METHOD (locked by the milestone doc)
-- =============================================================================
--   velocity_7d   = Σ sale_items.quantity over the trailing 7 days  ÷ 7
--   velocity_28d  = Σ sale_items.quantity over the trailing 28 days ÷ 28
--   base_velocity = 0.6·velocity_7d + 0.4·velocity_28d   (recent-weighted)
--   dow_factor[wd] = (avg units this business unit sold on weekday wd over the
--                     trailing 8 weeks) ÷ (overall daily average), clamped
--                     [0.5, 2.0]. A business-unit-wide seasonality factor, not
--                     per-product — "Fridays run ~1.6×" is a store statement.
--   forecast_next_day = base_velocity · dow_factor[tomorrow]
--   forecast_next_7d  = base_velocity · Σ dow_factor        (7 days = every
--                       weekday once, so the sum of all seven factors)
--   forecast_next_30d = base_velocity · 30                  (dow washes out)
--   trend  = sign of (v7 − v28)/v28  → rising | falling | steady  (±10% dead-band)
--   confidence = LOW when < 14 distinct sale-days in the trailing 28 days OR
--                < 20 units sold in that window; otherwise OK. A LOW product
--                shows "not enough history yet" instead of a hard number
--                (the client nulls its forecast fields when confidence = LOW).
--
-- restock:  days_of_cover       = on_hand ÷ base_velocity        (null if v = 0)
--           suggested_order_qty = ceil(base_velocity · lead_days) − on_hand,
--                                 floored at 0
--           flagged when days_of_cover < reorder_threshold_days
-- slow:     0 units in the trailing 30 days AND on_hand > 0, ranked by
--           on_hand · products.base_price (retail value — never cost, so no
--           cost figure ever lands in a payload a Branch Manager can read).
--
-- =============================================================================
-- SECURITY
-- =============================================================================
-- SECURITY DEFINER so the cache upsert is not blocked by RLS (the caller has
-- no INSERT grant). It therefore RE-CHECKS insights.view for the resolved
-- organization — a definer function must not hand back what its own definer
-- rights bypass — and hard-filters every query to the passed business unit and
-- its resolved branch. It takes no free-form input and runs no dynamic SQL.

-- compute_sales_insights() filters every sales scan by
-- `business_unit_id AND created_at >= <window>`. The existing sales indexes
-- are keyed on branch_id / organization_id, so without this the function seq-
-- scans `sales` on real volume (EXPLAIN on the seeded set confirmed it).
create index if not exists sales_business_unit_created_at_idx
  on public.sales (business_unit_id, created_at desc);

create or replace function public.compute_sales_insights(p_business_unit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_organization_id uuid;
  v_lead_days integer;
  v_reorder_threshold_days integer;
  v_dow_factor numeric[];
  v_dow_sum numeric;
  v_factor_tomorrow numeric;
  v_forecast jsonb;
  v_restock jsonb;
  v_slow jsonb;
begin
  select bu.branch_id, b.organization_id
    into v_branch_id, v_organization_id
  from public.business_units bu
  join public.branches b on b.id = bu.branch_id
  where bu.id = p_business_unit_id;

  if v_organization_id is null then
    raise exception 'business unit % not found', p_business_unit_id using errcode = 'P0002';
  end if;

  if not public.user_has_permission('insights.view', v_organization_id) then
    raise exception 'not authorized for insights on this organization' using errcode = '42501';
  end if;

  select coalesce(insights_lead_days, 14), coalesce(insights_reorder_threshold_days, 7)
    into v_lead_days, v_reorder_threshold_days
  from public.organizations
  where id = v_organization_id;

  -- Day-of-week seasonality for this business unit over the trailing 8 weeks.
  -- Denominator is total units ÷ 56 (all days, including zero days), not the
  -- mean of the seven weekday means.
  with per_day as (
    select date_trunc('day', s.created_at) as d, sum(si.quantity) as qty
    from public.sales s
    join public.sale_items si on si.sale_id = s.id
    where s.business_unit_id = p_business_unit_id
      and s.created_at >= now() - interval '56 days'
    group by 1
  ),
  by_dow as (
    select extract(dow from d)::int as wd, avg(qty) as avg_qty
    from per_day
    group by 1
  ),
  overall as (
    select coalesce(sum(qty), 0) / 56.0 as daily_avg
    from per_day
  )
  select array_agg(
    coalesce(
      least(2.0, greatest(0.5, d.avg_qty / nullif((select daily_avg from overall), 0))),
      1.0
    )
    order by wd_series.wd
  )
  into v_dow_factor
  from generate_series(0, 6) as wd_series(wd)
  left join by_dow d on d.wd = wd_series.wd;

  v_dow_factor := coalesce(v_dow_factor, array[1, 1, 1, 1, 1, 1, 1]::numeric[]);
  v_dow_sum := (select coalesce(sum(x), 7) from unnest(v_dow_factor) as x);
  -- Postgres arrays are 1-indexed; extract(dow) is 0..6.
  v_factor_tomorrow := v_dow_factor[(extract(dow from now() + interval '1 day')::int) + 1];

  -- Per-product velocity, on-hand, confidence and the derived figures.
  drop table if exists _insights_scratch;
  create temporary table _insights_scratch on commit drop as
  with sold as (
    select
      si.product_id,
      coalesce(sum(si.quantity) filter (where s.created_at >= now() - interval '7 days'), 0) as qty_7d,
      coalesce(sum(si.quantity) filter (where s.created_at >= now() - interval '28 days'), 0) as qty_28d,
      coalesce(sum(si.quantity) filter (where s.created_at >= now() - interval '30 days'), 0) as qty_30d,
      count(distinct date_trunc('day', s.created_at))
        filter (where s.created_at >= now() - interval '28 days') as days_28d
    from public.sales s
    join public.sale_items si on si.sale_id = s.id
    where s.business_unit_id = p_business_unit_id
      and s.created_at >= now() - interval '30 days'
    group by si.product_id
  ),
  on_hand as (
    select ib.product_id, sum(ib.quantity) as qty
    from public.inventory_balances ib
    where ib.branch_id = v_branch_id
    group by ib.product_id
  ),
  base as (
    select
      p.id as product_id,
      p.name,
      p.base_price,
      coalesce(oh.qty, 0) as on_hand,
      coalesce(sold.qty_7d, 0) / 7.0 as v7,
      coalesce(sold.qty_28d, 0) / 28.0 as v28,
      coalesce(sold.qty_28d, 0) as units_28d,
      coalesce(sold.qty_30d, 0) as units_30d,
      coalesce(sold.days_28d, 0) as days_28d
    from public.products p
    left join sold on sold.product_id = p.id
    left join on_hand oh on oh.product_id = p.id
    where p.business_unit_id = p_business_unit_id
      and p.archived_at is null
      and (sold.product_id is not null or oh.product_id is not null)
  )
  select
    product_id,
    name,
    base_price,
    on_hand,
    units_28d,
    units_30d,
    days_28d,
    v7,
    v28,
    (0.6 * v7 + 0.4 * v28) as base_velocity,
    case when days_28d < 14 or units_28d < 20 then 'LOW' else 'OK' end as confidence,
    case
      when v28 = 0 then 'steady'
      when (v7 - v28) / v28 > 0.10 then 'rising'
      when (v7 - v28) / v28 < -0.10 then 'falling'
      else 'steady'
    end as trend,
    case when (0.6 * v7 + 0.4 * v28) = 0 then null
         else round((0.6 * v7 + 0.4 * v28) * v_factor_tomorrow, 2) end as forecast_next_day,
    case when (0.6 * v7 + 0.4 * v28) = 0 then null
         else round((0.6 * v7 + 0.4 * v28) * v_dow_sum, 2) end as forecast_next_7d,
    case when (0.6 * v7 + 0.4 * v28) = 0 then null
         else round((0.6 * v7 + 0.4 * v28) * 30, 2) end as forecast_next_30d,
    case when (0.6 * v7 + 0.4 * v28) = 0 then null
         else round(on_hand / (0.6 * v7 + 0.4 * v28), 1) end as days_of_cover,
    greatest(0, ceil((0.6 * v7 + 0.4 * v28) * v_lead_days) - on_hand) as suggested_order_qty
  from base;

  -- forecast: products with real history, most-active first, capped at 100.
  select coalesce(jsonb_agg(row_json), '[]'::jsonb)
  into v_forecast
  from (
    select jsonb_build_object(
      'productId', product_id,
      'name', name,
      'forecastNextDay', case when confidence = 'LOW' then null else forecast_next_day end,
      'forecastNext7d', case when confidence = 'LOW' then null else forecast_next_7d end,
      'forecastNext30d', case when confidence = 'LOW' then null else forecast_next_30d end,
      'trend', trend,
      'confidence', confidence,
      'baseVelocity', round(base_velocity, 3),
      'daysOfCover', days_of_cover
    ) as row_json
    from _insights_scratch
    where units_28d > 0
    order by units_28d desc
    limit 100
  ) f;

  -- restock: below the cover threshold, soonest-to-run-out first, capped at 50.
  select coalesce(jsonb_agg(row_json), '[]'::jsonb)
  into v_restock
  from (
    select jsonb_build_object(
      'productId', product_id,
      'name', name,
      'onHand', on_hand,
      'daysOfCover', days_of_cover,
      'suggestedOrderQty', suggested_order_qty,
      'baseVelocity', round(base_velocity, 3)
    ) as row_json
    from _insights_scratch
    where days_of_cover is not null
      and days_of_cover < v_reorder_threshold_days
    order by days_of_cover asc
    limit 50
  ) r;

  -- slow movers: stocked, unsold in 30 days, most capital tied up first.
  select coalesce(jsonb_agg(row_json), '[]'::jsonb)
  into v_slow
  from (
    select jsonb_build_object(
      'productId', product_id,
      'name', name,
      'onHand', on_hand,
      'retailValue', round(on_hand * base_price, 2)
    ) as row_json
    from _insights_scratch
    where units_30d = 0
      and on_hand > 0
    order by on_hand * base_price desc
    limit 50
  ) s;

  insert into public.sales_insights_cache
    (organization_id, branch_id, business_unit_id, section, payload, computed_at)
  values
    (v_organization_id, v_branch_id, p_business_unit_id, 'forecast', v_forecast, now()),
    (v_organization_id, v_branch_id, p_business_unit_id, 'restock', v_restock, now()),
    (v_organization_id, v_branch_id, p_business_unit_id, 'slow_movers', v_slow, now())
  on conflict (business_unit_id, section)
  do update set payload = excluded.payload, computed_at = excluded.computed_at;
end;
$$;

revoke execute on function public.compute_sales_insights(uuid) from public;
grant execute on function public.compute_sales_insights(uuid) to authenticated;
