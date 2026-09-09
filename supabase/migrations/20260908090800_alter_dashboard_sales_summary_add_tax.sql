-- The dashboard "Sales summary" widget now surfaces an overall total broken
-- down into sales and tax (product-owner request). dashboard_sales_summary()
-- already returned `collected` (= sum of sale totals — what hit the till) but
-- never tax: it only scanned s.subtotal / s.discount_amount / s.total.
--
-- Add tax_collected and service_charge_collected so the widget can show
--   Total collected  =  Sales (net)  +  Tax  +  Service charge
-- an exact split, since sales.tax_amount / sales.service_charge_amount are
-- NOT NULL DEFAULT 0 (20260823120000_create_sales.sql) and
--   total = (subtotal - discount_amount) + tax_amount + service_charge_amount.
--
-- Column names mirror report_accounting_aggregates (tax_collected /
-- service_charge_collected) so the two modules never disagree.
--
-- Body is otherwise verbatim from
-- 20260908090200_alter_dashboard_sales_functions_security_definer.sql — the
-- SECURITY DEFINER flip + inlined branch-membership guard are kept. A
-- return-type change can't go through CREATE OR REPLACE, so drop first.
-- dashboard_sales_series() is untouched.

drop function if exists public.dashboard_sales_summary(uuid, timestamptz, timestamptz);

create function public.dashboard_sales_summary(
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  sale_count bigint,
  gross_sales numeric,
  net_sales numeric,
  collected numeric,
  tax_collected numeric,
  service_charge_collected numeric,
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
      s.tax_amount,
      s.service_charge_amount,
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
      coalesce(sum(tax_amount) filter (where is_current), 0) as cur_tax,
      coalesce(sum(service_charge_amount) filter (where is_current), 0) as cur_service,
      count(*) filter (where not is_current) as prior_count,
      coalesce(sum(subtotal - discount_amount) filter (where not is_current), 0) as prior_net
    from windowed
  )
  select
    cur_count,
    cur_gross,
    cur_net,
    cur_collected,
    cur_tax,
    cur_service,
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
