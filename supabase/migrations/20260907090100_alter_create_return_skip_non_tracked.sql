-- Milestone 17 Part B added products.track_inventory and taught create_sale()
-- to skip its stock movement for a non-tracked (service) line item
-- (20260906090400) — but missed the mirror case: create_return() called
-- record_inventory_movement() for every returned line unconditionally, so
-- returning a service item either errors against a balance row that was
-- never created for it, or spuriously creates one that's never meant to
-- exist. Same fix, same reasoning, applied here.
--
-- Body is verbatim from 20260823120800 (the current, never-since-altered
-- definition — confirmed against both this repo's migrations and the live
-- function on the hosted instance) except:
--   * v_track_inventory is fetched alongside the sale item's product/variant
--     ids, via the same public.products lookup create_sale() already uses;
--   * the record_inventory_movement() call is wrapped in
--     `if v_track_inventory then ... end if`.
-- Nothing else changes. Signature is unchanged, so create-or-replace is
-- sufficient — no drop-and-recreate needed.
create or replace function public.create_return(
  p_sale_id uuid,
  p_reason text,
  p_items jsonb
)
returns public.returns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales;
  v_return public.returns;
  v_item record;
  v_sale_item public.sale_items;
  v_already_returned numeric;
  v_track_inventory boolean;
begin
  select * into v_sale from public.sales where id = p_sale_id;
  if v_sale.id is null then
    raise exception 'unknown sale %', p_sale_id using errcode = 'P0002';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'a return must have at least one item' using errcode = 'P0004';
  end if;

  insert into public.returns (sale_id, organization_id, branch_id, reason, created_by)
  values (p_sale_id, v_sale.organization_id, v_sale.branch_id, p_reason, auth.uid())
  returning * into v_return;

  for v_item in
    select * from jsonb_to_recordset(p_items) as x(sale_item_id uuid, quantity numeric, reason text)
  loop
    if v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'return item quantity must be positive' using errcode = 'P0004';
    end if;

    select * into v_sale_item
    from public.sale_items
    where id = v_item.sale_item_id and sale_id = p_sale_id;

    if v_sale_item.id is null then
      raise exception 'sale item % does not belong to sale %', v_item.sale_item_id, p_sale_id
        using errcode = 'P0002';
    end if;

    select coalesce(sum(ri.quantity), 0) into v_already_returned
    from public.return_items ri
    where ri.sale_item_id = v_item.sale_item_id;

    if v_already_returned + v_item.quantity > v_sale_item.quantity then
      raise exception 'return quantity exceeds remaining returnable quantity for sale item %', v_item.sale_item_id
        using errcode = 'P0001';
    end if;

    insert into public.return_items (return_id, sale_item_id, quantity, reason)
    values (v_return.id, v_item.sale_item_id, v_item.quantity, v_item.reason);

    select track_inventory into v_track_inventory
    from public.products
    where id = v_sale_item.product_id;

    -- Milestone 17 Part B: a non-tracked product (a service line item) has no
    -- inventory to reverse — same guard as create_sale()'s forward path.
    if v_track_inventory then
      perform public.record_inventory_movement(
        v_sale.branch_id, v_sale_item.product_id, v_sale_item.variant_id,
        'RETURN', v_item.quantity, v_item.reason, 'return', v_return.id
      );
    end if;
  end loop;

  return v_return;
end;
$$;
