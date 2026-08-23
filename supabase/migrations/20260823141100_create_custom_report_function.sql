-- The custom report builder's execution engine.
--
-- =============================================================================
-- THIS FUNCTION IS THE ANSWER TO "RAW SQL FROM CUSTOM REPORTS: NEVER"
-- =============================================================================
-- docs/Security _Architecture_And_Authorization.md §68 is absolute on this
-- point, and Milestone 10's Risks section names custom report builders as "a
-- classic source of accidental data leakage". Read the mechanism before
-- changing anything here.
--
-- There is no `execute format(...)` in this file. There is no string
-- concatenation that produces SQL. The query text below is fully static and
-- fixed at migration time. Everything a caller can influence is a *choice
-- among pre-written expressions*, selected by a `case` on a short text token,
-- and every token is checked against an explicit array whitelist at the top of
-- the function before the query runs at all. A caller who sends
-- `'; drop table sales; --` as a dimension does not produce SQL; they produce
-- an unrecognised token and an exception.
--
-- That makes this the innermost of three independent layers, and the only one
-- that survives every other being bypassed:
--
--   1. lib/reports/schemas.ts parses a request with closed zod enums built from
--      lib/reports/registry.ts. No free-text field exists in the config shape.
--   2. What crosses into this function is never the caller's string — it is the
--      registry entry's `token`, a compile-time constant in TypeScript.
--   3. This function, which can only recognise the tokens listed below.
--
-- Layers 1 and 2 are defence in depth for a caller coming through the app.
-- Layer 3 is what holds when a caller skips the app entirely and posts to
-- `/rest/v1/rpc/run_custom_report` with a hostile payload — which is the threat
-- that actually matters, and the reason the whitelist is restated here in SQL
-- rather than trusted from TypeScript. tests/unit/reports/registry.test.ts
-- asserts the two lists stay in step, so adding a registry entry without a
-- matching branch below fails CI rather than at runtime.
--
-- Note also what a permitted token still cannot do. `SECURITY INVOKER` means
-- RLS applies, so a custom report cannot reach a row its author could not have
-- read directly — see 20260823141000's header for the full argument. And the
-- cost-bearing metrics (`cogs`, `gross_profit`) are gated in the registry
-- behind `reports.view_financials`, because aggregate cost is still cost
-- (the same reasoning that makes `products.view_cost_price` a separate
-- permission).
--
-- =============================================================================
-- SHAPE
-- =============================================================================
-- Fixed slots, not a variable projection: two dimension slots and four metric
-- slots, matching the complexity ceiling docs/Reporting_Analytics_and_Custom_
-- Reports.md §46 asks for and lib/reports/schemas.ts enforces. A builder
-- allowing arbitrarily many grouped columns would need dynamic SQL to express —
-- the limit and the safety property are the same design decision, not two.
--
-- The three datasets are gated by a constant predicate (`p_dataset = '...'`)
-- inside three CTEs unioned together, rather than three separate `return query`
-- statements in an IF/ELSIF. Two non-selected branches match nothing and cost
-- effectively nothing at execution, and in exchange the sort and limit logic
-- exists exactly once instead of three copies that could drift.
create or replace function public.run_custom_report(
  p_organization_id uuid,
  p_dataset text,
  p_dimension_1 text default null,
  p_dimension_2 text default null,
  p_metric_1 text default null,
  p_metric_2 text default null,
  p_metric_3 text default null,
  p_metric_4 text default null,
  p_branch_id uuid default null,
  p_business_unit_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_sort text default 'metric_1',
  p_sort_direction text default 'desc',
  p_limit int default 100
)
returns table (
  dimension_1 text,
  dimension_2 text,
  metric_1 numeric,
  metric_2 numeric,
  metric_3 numeric,
  metric_4 numeric
)
language plpgsql
security invoker
stable
set search_path = public
as $$
declare
  v_dimensions text[];
  v_metrics text[];
  v_token text;
begin
  -- ---------------------------------------------------------------------
  -- The whitelist. Every token the engine will accept, per dataset, in one
  -- readable place — this is the artifact to review against §68, and it must
  -- stay identical to lib/reports/registry.ts's `token` values.
  -- ---------------------------------------------------------------------
  if p_dataset = 'sales' then
    v_dimensions := array[
      'day', 'week', 'month', 'branch', 'business_unit',
      'employee', 'customer', 'discount_reason'
    ];
    v_metrics := array[
      'sale_count', 'gross_sales', 'order_discount', 'line_discount', 'net_sales',
      'tax', 'service_charge', 'total', 'average_sale', 'cogs', 'gross_profit',
      'quantity_sold'
    ];
  elsif p_dataset = 'sale_items' then
    v_dimensions := array[
      'day', 'month', 'product', 'variant', 'category', 'branch', 'business_unit'
    ];
    v_metrics := array[
      'line_count', 'quantity_sold', 'gross_sales', 'line_discount', 'net_sales',
      'cogs', 'gross_profit', 'average_unit_price'
    ];
  elsif p_dataset = 'expenses' then
    v_dimensions := array[
      'day', 'month', 'category', 'branch', 'business_unit', 'payment_method', 'status'
    ];
    v_metrics := array[
      'expense_count', 'total_amount', 'approved_amount', 'pending_amount',
      'rejected_amount', 'voided_amount', 'average_amount'
    ];
  else
    raise exception 'unknown custom report dataset %', p_dataset using errcode = 'P0004';
  end if;

  if p_dimension_1 is null then
    raise exception 'a custom report needs at least one dimension' using errcode = 'P0004';
  end if;
  if p_metric_1 is null then
    raise exception 'a custom report needs at least one metric' using errcode = 'P0004';
  end if;

  foreach v_token in array array[p_dimension_1, p_dimension_2] loop
    if v_token is not null and not (v_token = any (v_dimensions)) then
      raise exception 'unknown dimension % for dataset %', v_token, p_dataset
        using errcode = 'P0004';
    end if;
  end loop;

  foreach v_token in array array[p_metric_1, p_metric_2, p_metric_3, p_metric_4] loop
    if v_token is not null and not (v_token = any (v_metrics)) then
      raise exception 'unknown metric % for dataset %', v_token, p_dataset
        using errcode = 'P0004';
    end if;
  end loop;

  if p_sort not in ('dimension_1', 'dimension_2', 'metric_1', 'metric_2', 'metric_3', 'metric_4') then
    raise exception 'unknown sort key %', p_sort using errcode = 'P0004';
  end if;
  if p_sort_direction not in ('asc', 'desc') then
    raise exception 'unknown sort direction %', p_sort_direction using errcode = 'P0004';
  end if;

  -- Every `case` below can therefore only be reached with a token already
  -- proven to be on the list, which is why each ends in a plain `else null`
  -- rather than another raise: an unreachable branch that pretended to be a
  -- second line of defence would be misleading about where the real one is.
  return query
  with sales_rows as (
    select
      d.d1 as dimension_1,
      d.d2 as dimension_2,
      case p_metric_1
        when 'sale_count' then count(*)::numeric
        when 'gross_sales' then sum(s.subtotal)
        when 'order_discount' then sum(s.discount_amount)
        when 'line_discount' then sum(coalesce(items.line_discount, 0))
        when 'net_sales' then sum(s.subtotal - s.discount_amount)
        when 'tax' then sum(s.tax_amount)
        when 'service_charge' then sum(s.service_charge_amount)
        when 'total' then sum(s.total)
        when 'average_sale' then round(avg(s.total), 2)
        when 'cogs' then sum(coalesce(items.cogs, 0))
        when 'gross_profit' then sum(s.subtotal - s.discount_amount - coalesce(items.cogs, 0))
        when 'quantity_sold' then sum(coalesce(items.quantity, 0))
        else null
      end as metric_1,
      case p_metric_2
        when 'sale_count' then count(*)::numeric
        when 'gross_sales' then sum(s.subtotal)
        when 'order_discount' then sum(s.discount_amount)
        when 'line_discount' then sum(coalesce(items.line_discount, 0))
        when 'net_sales' then sum(s.subtotal - s.discount_amount)
        when 'tax' then sum(s.tax_amount)
        when 'service_charge' then sum(s.service_charge_amount)
        when 'total' then sum(s.total)
        when 'average_sale' then round(avg(s.total), 2)
        when 'cogs' then sum(coalesce(items.cogs, 0))
        when 'gross_profit' then sum(s.subtotal - s.discount_amount - coalesce(items.cogs, 0))
        when 'quantity_sold' then sum(coalesce(items.quantity, 0))
        else null
      end as metric_2,
      case p_metric_3
        when 'sale_count' then count(*)::numeric
        when 'gross_sales' then sum(s.subtotal)
        when 'order_discount' then sum(s.discount_amount)
        when 'line_discount' then sum(coalesce(items.line_discount, 0))
        when 'net_sales' then sum(s.subtotal - s.discount_amount)
        when 'tax' then sum(s.tax_amount)
        when 'service_charge' then sum(s.service_charge_amount)
        when 'total' then sum(s.total)
        when 'average_sale' then round(avg(s.total), 2)
        when 'cogs' then sum(coalesce(items.cogs, 0))
        when 'gross_profit' then sum(s.subtotal - s.discount_amount - coalesce(items.cogs, 0))
        when 'quantity_sold' then sum(coalesce(items.quantity, 0))
        else null
      end as metric_3,
      case p_metric_4
        when 'sale_count' then count(*)::numeric
        when 'gross_sales' then sum(s.subtotal)
        when 'order_discount' then sum(s.discount_amount)
        when 'line_discount' then sum(coalesce(items.line_discount, 0))
        when 'net_sales' then sum(s.subtotal - s.discount_amount)
        when 'tax' then sum(s.tax_amount)
        when 'service_charge' then sum(s.service_charge_amount)
        when 'total' then sum(s.total)
        when 'average_sale' then round(avg(s.total), 2)
        when 'cogs' then sum(coalesce(items.cogs, 0))
        when 'gross_profit' then sum(s.subtotal - s.discount_amount - coalesce(items.cogs, 0))
        when 'quantity_sold' then sum(coalesce(items.quantity, 0))
        else null
      end as metric_4
    from public.sales s
    left join lateral (
      select
        sum(si.line_discount) as line_discount,
        sum(si.quantity * si.unit_cost) as cogs,
        sum(si.quantity) as quantity
      from public.sale_items si
      where si.sale_id = s.id
    ) items on true
    left join public.branches b on b.id = s.branch_id
    left join public.business_units bu on bu.id = s.business_unit_id
    left join public.users u on u.id = s.created_by
    left join public.customers cu on cu.id = s.customer_id
    cross join lateral (
      select
        case p_dimension_1
          when 'day' then to_char(date_trunc('day', s.created_at), 'YYYY-MM-DD')
          when 'week' then 'Week of ' || to_char(date_trunc('week', s.created_at), 'YYYY-MM-DD')
          when 'month' then to_char(date_trunc('month', s.created_at), 'YYYY-MM')
          when 'branch' then coalesce(b.name, 'Unknown branch')
          when 'business_unit' then coalesce(bu.name, 'Unknown business unit')
          when 'employee' then coalesce(u.full_name, 'Unassigned')
          when 'customer' then coalesce(cu.name, 'Walk-in')
          when 'discount_reason' then coalesce(s.discount_reason, 'No discount')
          else null
        end as d1,
        case p_dimension_2
          when 'day' then to_char(date_trunc('day', s.created_at), 'YYYY-MM-DD')
          when 'week' then 'Week of ' || to_char(date_trunc('week', s.created_at), 'YYYY-MM-DD')
          when 'month' then to_char(date_trunc('month', s.created_at), 'YYYY-MM')
          when 'branch' then coalesce(b.name, 'Unknown branch')
          when 'business_unit' then coalesce(bu.name, 'Unknown business unit')
          when 'employee' then coalesce(u.full_name, 'Unassigned')
          when 'customer' then coalesce(cu.name, 'Walk-in')
          when 'discount_reason' then coalesce(s.discount_reason, 'No discount')
          else null
        end as d2
    ) d
    where p_dataset = 'sales'
      and s.organization_id = p_organization_id
      and (p_branch_id is null or s.branch_id = p_branch_id)
      and (p_business_unit_id is null or s.business_unit_id = p_business_unit_id)
      and (p_from is null or s.created_at >= p_from)
      and (p_to is null or s.created_at < p_to)
    group by d.d1, d.d2
  ),
  item_rows as (
    select
      d.d1 as dimension_1,
      d.d2 as dimension_2,
      case p_metric_1
        when 'line_count' then count(*)::numeric
        when 'quantity_sold' then sum(si.quantity)
        when 'gross_sales' then sum(si.line_total + si.line_discount)
        when 'line_discount' then sum(si.line_discount)
        when 'net_sales' then sum(si.line_total)
        when 'cogs' then sum(si.quantity * si.unit_cost)
        when 'gross_profit' then sum(si.line_total - (si.quantity * si.unit_cost))
        when 'average_unit_price' then round(avg(si.unit_price), 2)
        else null
      end as metric_1,
      case p_metric_2
        when 'line_count' then count(*)::numeric
        when 'quantity_sold' then sum(si.quantity)
        when 'gross_sales' then sum(si.line_total + si.line_discount)
        when 'line_discount' then sum(si.line_discount)
        when 'net_sales' then sum(si.line_total)
        when 'cogs' then sum(si.quantity * si.unit_cost)
        when 'gross_profit' then sum(si.line_total - (si.quantity * si.unit_cost))
        when 'average_unit_price' then round(avg(si.unit_price), 2)
        else null
      end as metric_2,
      case p_metric_3
        when 'line_count' then count(*)::numeric
        when 'quantity_sold' then sum(si.quantity)
        when 'gross_sales' then sum(si.line_total + si.line_discount)
        when 'line_discount' then sum(si.line_discount)
        when 'net_sales' then sum(si.line_total)
        when 'cogs' then sum(si.quantity * si.unit_cost)
        when 'gross_profit' then sum(si.line_total - (si.quantity * si.unit_cost))
        when 'average_unit_price' then round(avg(si.unit_price), 2)
        else null
      end as metric_3,
      case p_metric_4
        when 'line_count' then count(*)::numeric
        when 'quantity_sold' then sum(si.quantity)
        when 'gross_sales' then sum(si.line_total + si.line_discount)
        when 'line_discount' then sum(si.line_discount)
        when 'net_sales' then sum(si.line_total)
        when 'cogs' then sum(si.quantity * si.unit_cost)
        when 'gross_profit' then sum(si.line_total - (si.quantity * si.unit_cost))
        when 'average_unit_price' then round(avg(si.unit_price), 2)
        else null
      end as metric_4
    from public.sale_items si
    join public.sales s on s.id = si.sale_id
    left join public.products p on p.id = si.product_id
    left join public.product_variants pv on pv.id = si.variant_id
    left join public.categories c on c.id = p.category_id
    left join public.branches b on b.id = s.branch_id
    left join public.business_units bu on bu.id = s.business_unit_id
    cross join lateral (
      select
        case p_dimension_1
          when 'day' then to_char(date_trunc('day', s.created_at), 'YYYY-MM-DD')
          when 'month' then to_char(date_trunc('month', s.created_at), 'YYYY-MM')
          when 'product' then coalesce(p.name, 'Unknown product')
          when 'variant' then coalesce(p.name, 'Unknown product') || coalesce(' — ' || pv.name, '')
          when 'category' then coalesce(c.name, 'Uncategorised')
          when 'branch' then coalesce(b.name, 'Unknown branch')
          when 'business_unit' then coalesce(bu.name, 'Unknown business unit')
          else null
        end as d1,
        case p_dimension_2
          when 'day' then to_char(date_trunc('day', s.created_at), 'YYYY-MM-DD')
          when 'month' then to_char(date_trunc('month', s.created_at), 'YYYY-MM')
          when 'product' then coalesce(p.name, 'Unknown product')
          when 'variant' then coalesce(p.name, 'Unknown product') || coalesce(' — ' || pv.name, '')
          when 'category' then coalesce(c.name, 'Uncategorised')
          when 'branch' then coalesce(b.name, 'Unknown branch')
          when 'business_unit' then coalesce(bu.name, 'Unknown business unit')
          else null
        end as d2
    ) d
    where p_dataset = 'sale_items'
      and s.organization_id = p_organization_id
      and (p_branch_id is null or s.branch_id = p_branch_id)
      and (p_business_unit_id is null or s.business_unit_id = p_business_unit_id)
      and (p_from is null or s.created_at >= p_from)
      and (p_to is null or s.created_at < p_to)
    group by d.d1, d.d2
  ),
  expense_rows as (
    select
      d.d1 as dimension_1,
      d.d2 as dimension_2,
      case p_metric_1
        when 'expense_count' then count(*)::numeric
        when 'total_amount' then sum(e.amount)
        when 'approved_amount' then coalesce(sum(e.amount) filter (where e.status = 'approved' and e.voided_at is null), 0)
        when 'pending_amount' then coalesce(sum(e.amount) filter (where e.status = 'pending' and e.voided_at is null), 0)
        when 'rejected_amount' then coalesce(sum(e.amount) filter (where e.status = 'rejected' and e.voided_at is null), 0)
        when 'voided_amount' then coalesce(sum(e.amount) filter (where e.voided_at is not null), 0)
        when 'average_amount' then round(avg(e.amount), 2)
        else null
      end as metric_1,
      case p_metric_2
        when 'expense_count' then count(*)::numeric
        when 'total_amount' then sum(e.amount)
        when 'approved_amount' then coalesce(sum(e.amount) filter (where e.status = 'approved' and e.voided_at is null), 0)
        when 'pending_amount' then coalesce(sum(e.amount) filter (where e.status = 'pending' and e.voided_at is null), 0)
        when 'rejected_amount' then coalesce(sum(e.amount) filter (where e.status = 'rejected' and e.voided_at is null), 0)
        when 'voided_amount' then coalesce(sum(e.amount) filter (where e.voided_at is not null), 0)
        when 'average_amount' then round(avg(e.amount), 2)
        else null
      end as metric_2,
      case p_metric_3
        when 'expense_count' then count(*)::numeric
        when 'total_amount' then sum(e.amount)
        when 'approved_amount' then coalesce(sum(e.amount) filter (where e.status = 'approved' and e.voided_at is null), 0)
        when 'pending_amount' then coalesce(sum(e.amount) filter (where e.status = 'pending' and e.voided_at is null), 0)
        when 'rejected_amount' then coalesce(sum(e.amount) filter (where e.status = 'rejected' and e.voided_at is null), 0)
        when 'voided_amount' then coalesce(sum(e.amount) filter (where e.voided_at is not null), 0)
        when 'average_amount' then round(avg(e.amount), 2)
        else null
      end as metric_3,
      case p_metric_4
        when 'expense_count' then count(*)::numeric
        when 'total_amount' then sum(e.amount)
        when 'approved_amount' then coalesce(sum(e.amount) filter (where e.status = 'approved' and e.voided_at is null), 0)
        when 'pending_amount' then coalesce(sum(e.amount) filter (where e.status = 'pending' and e.voided_at is null), 0)
        when 'rejected_amount' then coalesce(sum(e.amount) filter (where e.status = 'rejected' and e.voided_at is null), 0)
        when 'voided_amount' then coalesce(sum(e.amount) filter (where e.voided_at is not null), 0)
        when 'average_amount' then round(avg(e.amount), 2)
        else null
      end as metric_4
    from public.expenses e
    left join public.branches b on b.id = e.branch_id
    left join public.business_units bu on bu.id = e.business_unit_id
    cross join lateral (
      select
        case p_dimension_1
          when 'day' then to_char(e.expense_date, 'YYYY-MM-DD')
          when 'month' then to_char(e.expense_date, 'YYYY-MM')
          when 'category' then e.category
          when 'branch' then coalesce(b.name, 'Unknown branch')
          when 'business_unit' then coalesce(bu.name, 'Unassigned')
          when 'payment_method' then initcap(replace(e.payment_method, '_', ' '))
          when 'status' then initcap(e.status)
          else null
        end as d1,
        case p_dimension_2
          when 'day' then to_char(e.expense_date, 'YYYY-MM-DD')
          when 'month' then to_char(e.expense_date, 'YYYY-MM')
          when 'category' then e.category
          when 'branch' then coalesce(b.name, 'Unknown branch')
          when 'business_unit' then coalesce(bu.name, 'Unassigned')
          when 'payment_method' then initcap(replace(e.payment_method, '_', ' '))
          when 'status' then initcap(e.status)
          else null
        end as d2
    ) d
    where p_dataset = 'expenses'
      and e.organization_id = p_organization_id
      and (p_branch_id is null or e.branch_id = p_branch_id)
      and (p_business_unit_id is null or e.business_unit_id = p_business_unit_id)
      and (p_from is null or e.expense_date >= p_from::date)
      and (p_to is null or e.expense_date < p_to::date)
    group by d.d1, d.d2
  ),
  base as (
    select * from sales_rows
    union all
    select * from item_rows
    union all
    select * from expense_rows
  )
  select
    base.dimension_1,
    base.dimension_2,
    base.metric_1,
    base.metric_2,
    base.metric_3,
    base.metric_4
  from base
  -- Static ORDER BY, one clause per (sort key, direction) pair. Each `case`
  -- yields null for every combination the caller did not request, so with
  -- `nulls last` those clauses are constant and contribute no ordering.
  -- Sorting in the application instead would be wrong, not merely slower: the
  -- LIMIT below applies before rows leave Postgres, so an application-side sort
  -- would be sorting an arbitrary subset.
  order by
    (case when p_sort = 'dimension_1' and p_sort_direction = 'asc' then base.dimension_1 end) asc nulls last,
    (case when p_sort = 'dimension_1' and p_sort_direction = 'desc' then base.dimension_1 end) desc nulls last,
    (case when p_sort = 'dimension_2' and p_sort_direction = 'asc' then base.dimension_2 end) asc nulls last,
    (case when p_sort = 'dimension_2' and p_sort_direction = 'desc' then base.dimension_2 end) desc nulls last,
    (case when p_sort = 'metric_1' and p_sort_direction = 'asc' then base.metric_1 end) asc nulls last,
    (case when p_sort = 'metric_1' and p_sort_direction = 'desc' then base.metric_1 end) desc nulls last,
    (case when p_sort = 'metric_2' and p_sort_direction = 'asc' then base.metric_2 end) asc nulls last,
    (case when p_sort = 'metric_2' and p_sort_direction = 'desc' then base.metric_2 end) desc nulls last,
    (case when p_sort = 'metric_3' and p_sort_direction = 'asc' then base.metric_3 end) asc nulls last,
    (case when p_sort = 'metric_3' and p_sort_direction = 'desc' then base.metric_3 end) desc nulls last,
    (case when p_sort = 'metric_4' and p_sort_direction = 'asc' then base.metric_4 end) asc nulls last,
    (case when p_sort = 'metric_4' and p_sort_direction = 'desc' then base.metric_4 end) desc nulls last,
    base.dimension_1 asc
  limit least(coalesce(p_limit, 100), 1000);
end;
$$;
