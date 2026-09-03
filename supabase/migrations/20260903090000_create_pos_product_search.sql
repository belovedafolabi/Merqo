-- The POS search-as-you-type read, as one function.
--
-- =============================================================================
-- WHY A FUNCTION AND NOT THE POSTGREST QUERY IT REPLACES
-- =============================================================================
-- lib/products/queries.ts's searchProducts() issues:
--
--   .or('name.ilike.%t%,sku.ilike.%t%,barcode.ilike.%t%')
--
-- Two problems, one of them user-visible.
--
-- 1. It cannot match a CATEGORY name. `categories` is an embedded resource in
--    that query, and PostgREST's `or=` applies to the top-level table; pushing
--    the predicate onto the embed turns it into a filter on the join, not an
--    additional way to match a product. Cashiers ask for "the drinks" as often
--    as they ask for a product by name, so the search has to reach the
--    category. A single join here does that in one round trip.
--
-- 2. searchProducts() calls canViewCostPrice() first, which is an extra
--    getCurrentUserContext() — an auth round trip plus a permission-grant
--    fetch — on EVERY keystroke, purely to decide whether to redact
--    cost_price. The POS never displays cost price at all. This function's
--    return type simply has no cost_price column, so the redaction question
--    cannot arise and the permission round trip disappears by construction
--    rather than by a caller remembering to skip it.
--
-- =============================================================================
-- SECURITY INVOKER, per 20260823141000's header
-- =============================================================================
-- A read. products_select and categories_select already scope rows to the
-- business units the caller can reach, and inheriting those policies is
-- strictly safer than re-deriving the boundary in a WHERE clause here. Note
-- p_business_unit_id is a NARROWING filter, not the authorization check — RLS
-- is what makes another org's business unit return zero rows.
--
-- =============================================================================
-- NO NEW INDEX
-- =============================================================================
-- Deliberate, and measured rather than assumed. §1.2 of the Milestone 16 plan
-- gated a sku/barcode trigram index on the leading-wildcard case in
-- tests/integration/pos-search-performance.test.ts exceeding 400ms against a
-- 25,000-product catalog; it does not, and that suite's EXPLAIN assertion
-- shows `business_unit_id` already narrows to one unit by index before the
-- ilike runs. products_name_trgm_idx (20260823100600) remains the only
-- trigram index. The latency this milestone is fixing was never in the query
-- — it was the Server Action round trip and the permission fetch above.
create or replace function public.pos_search_products(
  p_business_unit_id uuid,
  p_term text,
  p_limit int default 50
)
returns table (
  id uuid,
  name text,
  sku text,
  barcode text,
  base_price numeric,
  unit_of_measurement text,
  category_id uuid,
  category_name text
)
language sql
security invoker
stable
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.sku,
    p.barcode,
    p.base_price,
    p.unit_of_measurement,
    p.category_id,
    c.name
  from public.products p
  left join public.categories c on c.id = p.category_id
  where p.business_unit_id = p_business_unit_id
    and p.archived_at is null
    and (
      p.name ilike '%' || p_term || '%'
      or p.sku ilike '%' || p_term || '%'
      or p.barcode ilike '%' || p_term || '%'
      or c.name ilike '%' || p_term || '%'
    )
  -- A cashier typing "mi" wants "Milk", not "Semi-skimmed" — so anything the
  -- term PREFIXES sorts above anything it merely appears inside. Exact SKU and
  -- barcode hits sort first of all: those are unambiguous, and a scanner
  -- fallback (lib/products/queries.ts's lookupProductByBarcode miss path)
  -- lands here with a full code.
  order by
    (p.sku = p_term or p.barcode = p_term) desc,
    (p.name ilike p_term || '%') desc,
    p.name
  limit least(coalesce(p_limit, 50), 100);
$$;

-- Explicit privileges, per 20260826090500's header: a function with a NULL
-- proacl is EXECUTE for PUBLIC, which includes anon, and
-- tests/integration/security-sweep.test.ts fails the build on any function
-- that is anon-executable without being in its documented allow-list.
revoke execute on function public.pos_search_products(uuid, text, int) from public;
grant execute on function public.pos_search_products(uuid, text, int) to authenticated;
