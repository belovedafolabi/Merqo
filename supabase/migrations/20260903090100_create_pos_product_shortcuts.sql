-- The POS's two fast-access strips: what this branch sold most recently, and
-- what it sells most. docs/Functional_Specification.md §164 asks for exactly
-- this ("frequently sold products" reachable without searching); until now the
-- till had no path to a product except typing or scanning.
--
-- =============================================================================
-- WHY NOT report_sales_by_item()
-- =============================================================================
-- 20260823141000 already computes "top products", and reusing it was the first
-- instinct. It cannot be reused, for an authorization reason rather than a
-- shape one: lib/reports/queries.ts gates every standard report on
-- `reports.view`, and a Cashier does not hold it (see seed.sql's role grants).
-- Routing a till widget through the reporting stack would either hand cashiers
-- reporting permission — which is a real privilege escalation, since
-- `reports.view` also unlocks margins and payment-method breakdowns — or leave
-- the strips permanently empty for the exact role that needs them.
--
-- So this is a deliberately narrower function: no money aggregates beyond the
-- price already on the product tile, no cost or profit columns, no grouping
-- parameter. It answers "which products should this till put one tap away",
-- and nothing else. Anyone who can ring up a sale may ask it.
--
-- =============================================================================
-- SECURITY INVOKER, per 20260823141000's header
-- =============================================================================
-- A read. sales_select, sale_items_select and products_select already scope
-- rows to the branches and business units the caller can reach. p_branch_id /
-- p_business_unit_id narrow within that; RLS is what makes another tenant's
-- branch return zero rows.
--
-- No new index: sales_branch_id_idx (branch_id, created_at desc) from
-- 20260823120000 serves both halves — the recency scan and the 30-day window.
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
language sql
security invoker
stable
set search_path = public
as $$
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
$$;

-- Explicit privileges, per 20260826090500's header.
revoke execute on function public.pos_product_shortcuts(uuid, uuid, int) from public;
grant execute on function public.pos_product_shortcuts(uuid, uuid, int) to authenticated;
