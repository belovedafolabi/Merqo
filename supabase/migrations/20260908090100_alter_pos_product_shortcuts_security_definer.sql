-- pos_product_shortcuts() was SECURITY INVOKER (20260903090100), so every
-- sales_select / sale_items_select / products_select / categories_select RLS
-- `using` clause — each an EXISTS() on user_has_permission() /
-- user_has_*_access() — was re-evaluated per row across the join it
-- aggregates. Fine at ~20 sales; an 8s statement-timeout at ~2000, which
-- surfaced in production as an RSC render crash ("Something went wrong") on
-- the Admin dashboard's "top products" card, since app/(app)/dashboard/page.tsx
-- calls this for the `top_products` widget and rethrows the error. The POS's
-- own recently-sold / most-sold strips hit the same wall.
--
-- Fix, matching the shape create_sale() / compute_sales_insights() already
-- use: SECURITY DEFINER with ONE upfront access check. The caller must be
-- able to reach this business unit; every query below is already
-- hard-filtered to p_branch_id + p_business_unit_id, so another tenant still
-- gets zero rows. Body is otherwise verbatim from 20260903090100.
create or replace function public.pos_product_shortcuts(
  p_branch_id uuid,
  p_business_unit_id uuid,
  p_limit int default 12
)
returns table (
  kind text,
  id uuid,
  name text,
  sku text,
  base_price numeric,
  category_name text,
  last_sold_at timestamptz,
  quantity_sold numeric
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.user_has_business_unit_access(p_business_unit_id, p_branch_id) then
    return;
  end if;

  return query
  with capped as (
    select least(coalesce(p_limit, 12), 50) as n
  ),
  -- Deliberately branch-wide, not per-cashier: a till is a shared station and
  -- the useful question at 9am is "what has this shop been selling", not "what
  -- did whoever last logged in sell". It also means a brand-new cashier's
  -- strips are populated on their first shift.
  sold as (
    select
      si.product_id,
      max(s.created_at) as last_sold_at,
      sum(si.quantity) filter (where s.created_at >= now() - interval '30 days') as qty_30d
    from public.sale_items si
    join public.sales s on s.id = si.sale_id
    where s.branch_id = p_branch_id
      and s.business_unit_id = p_business_unit_id
      -- Bounded so this never degrades into a full-history scan on a shop
      -- that has been trading for years. Recency only ever looks at the last
      -- few sales anyway, and the volume half is a 30-day question.
      and s.created_at >= now() - interval '90 days'
    group by si.product_id
  ),
  -- Archived and deleted products are filtered by the join, not by a separate
  -- pass: a tile the cashier cannot actually sell is worse than a shorter
  -- strip.
  sellable as (
    select
      sold.product_id,
      sold.last_sold_at,
      coalesce(sold.qty_30d, 0) as qty_30d,
      p.name,
      p.sku,
      p.base_price,
      c.name as category_name
    from sold
    join public.products p on p.id = sold.product_id
    left join public.categories c on c.id = p.category_id
    where p.archived_at is null
      and p.business_unit_id = p_business_unit_id
  )
  -- Each branch is parenthesised so its ORDER BY / LIMIT belongs to that
  -- branch. Unparenthesised, they would bind to the UNION as a whole and
  -- return one interleaved, singly-truncated list instead of two strips.
  (
    select 'recent', s.product_id, s.name, s.sku, s.base_price, s.category_name,
           s.last_sold_at, s.qty_30d
    from sellable s
    order by s.last_sold_at desc
    limit (select n from capped)
  )
  union all
  (
    select 'top', s.product_id, s.name, s.sku, s.base_price, s.category_name,
           s.last_sold_at, s.qty_30d
    from sellable s
    -- A product with no sales in the window has nothing to rank on, and
    -- padding the strip with zeroes would misrepresent it as a best seller.
    where s.qty_30d > 0
    order by s.qty_30d desc, s.name
    limit (select n from capped)
  );
end;
$$;

revoke execute on function public.pos_product_shortcuts(uuid, uuid, int) from public;
grant execute on function public.pos_product_shortcuts(uuid, uuid, int) to authenticated;
