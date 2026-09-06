-- Post-MS17: the POS shows its category chips at all times now (not only
-- while a search term is present), and picking one with the search box empty
-- browses that category. pos_search_products() gains an optional
-- p_category_id: when set it narrows to that category, and an empty p_term
-- ('%%' matches every product) then lists the whole category.
--
-- Drop + recreate on the new 4-arg signature (the 3-arg one had no other
-- callers). Body verbatim from 20260903090000 except the extra predicate.
-- Still SECURITY INVOKER: a browse lists ~one menu's worth of rows, nowhere
-- near the volume that made pos_product_shortcuts (20260908090100) time out.
drop function if exists public.pos_search_products(uuid, text, int);

create function public.pos_search_products(
  p_business_unit_id uuid,
  p_term text,
  p_limit int default 50,
  p_category_id uuid default null
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
    and (p_category_id is null or p.category_id = p_category_id)
    and (
      p.name ilike '%' || p_term || '%'
      or p.sku ilike '%' || p_term || '%'
      or p.barcode ilike '%' || p_term || '%'
      or c.name ilike '%' || p_term || '%'
    )
  order by
    (p.sku = p_term or p.barcode = p_term) desc,
    (p.name ilike p_term || '%') desc,
    p.name
  limit least(coalesce(p_limit, 50), 100);
$$;

revoke execute on function public.pos_search_products(uuid, text, int, uuid) from public;
grant execute on function public.pos_search_products(uuid, text, int, uuid) to authenticated;
