-- The two atomic primitives this milestone's Technical Requirements call
-- for: "All inventory mutations execute inside a database transaction, with
-- appropriate locking to guarantee atomicity under concurrent access" and
-- "Movement recording implemented as a single shared server-side function
-- (e.g., recordInventoryMovement()), used by adjustments, transfers, and
-- (later) sales/returns in Milestone 08 — never duplicated per call site."
--
-- Both are SECURITY DEFINER (same pattern as record_product_price()/
-- record_audit_event()) and, unlike those two, resolve `created_by` from
-- `auth.uid()` internally rather than trusting a caller-supplied argument —
-- a deliberate strengthening given inventory mutations' larger blast radius
-- than a price-history or audit-log row. Neither function re-checks
-- permissions itself: lib/inventory/mutations.ts's requirePermission()
-- calls are the authorization gate, exactly the same division of
-- responsibility record_product_price()'s own comment documents.
create or replace function public.record_inventory_movement(
  p_branch_id uuid,
  p_product_id uuid,
  p_variant_id uuid,
  p_movement_type text,
  p_quantity_delta numeric,
  p_reason text,
  p_reference_type text,
  p_reference_id uuid
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_unit_id uuid;
  v_current_quantity numeric;
  v_new_quantity numeric;
  v_movement public.inventory_movements;
begin
  -- business_unit_id is always derived from the product, never trusted from
  -- the caller — same reasoning as
  -- sync_product_variant_business_unit_id() (20260823100200_create_product_
  -- variants.sql): a product's owning business unit is a fact this function
  -- must get right on its own, not accept as an assertion.
  select business_unit_id into v_business_unit_id
  from public.products
  where id = p_product_id;

  if v_business_unit_id is null then
    raise exception 'unknown product %', p_product_id using errcode = 'P0002';
  end if;

  -- Upsert first so the FOR UPDATE below always has a row to lock, even on
  -- a product's very first movement at this branch — `do nothing` means an
  -- existing row (and its quantity) is left untouched by this step.
  insert into public.inventory_balances (branch_id, business_unit_id, product_id, variant_id)
  values (p_branch_id, v_business_unit_id, p_product_id, p_variant_id)
  on conflict (branch_id, product_id, variant_id) do nothing;

  -- The row-level lock is the entire concurrency guarantee (docs/TAS.md
  -- §18: "inventory validation and inventory deduction must occur
  -- atomically"). A second concurrent caller against this exact balance
  -- blocks here until the first commits, then reads the first's committed
  -- quantity — never a lost update.
  select quantity into v_current_quantity
  from public.inventory_balances
  where branch_id = p_branch_id
    and product_id = p_product_id
    and variant_id is not distinct from p_variant_id
  for update;

  v_new_quantity := v_current_quantity + p_quantity_delta;
  if v_new_quantity < 0 then
    raise exception 'insufficient stock: % available, % requested', v_current_quantity, p_quantity_delta
      using errcode = 'P0001';
  end if;

  insert into public.inventory_movements (
    branch_id, business_unit_id, product_id, variant_id, movement_type,
    quantity_delta, quantity_after, reason, reference_type, reference_id, created_by
  ) values (
    p_branch_id, v_business_unit_id, p_product_id, p_variant_id, p_movement_type,
    p_quantity_delta, v_new_quantity, p_reason, p_reference_type, p_reference_id, auth.uid()
  )
  returning * into v_movement;

  update public.inventory_balances
  set quantity = v_new_quantity
  where branch_id = p_branch_id
    and product_id = p_product_id
    and variant_id is not distinct from p_variant_id;

  return v_movement;
end;
$$;

-- Branch-to-branch transfer (Decision #4). Takes a JSONB items array so a
-- multi-line transfer is one function call — one Postgres transaction,
-- all-or-nothing per this milestone's FR ("either fully succeeds... or
-- fully fails with no partial state"). Each item debits a source product
-- row and credits a *different* destination product row (see this
-- milestone's own plan doc / 20260823110200_create_stock_transfers.sql's
-- comment for why two product references, not one, is the structurally
-- correct model here) by calling record_inventory_movement() once per side
-- — the single shared function, never a duplicated inline update.
create or replace function public.execute_stock_transfer(
  p_organization_id uuid,
  p_source_branch_id uuid,
  p_destination_branch_id uuid,
  p_items jsonb
)
returns public.stock_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer public.stock_transfers;
  v_item record;
begin
  if p_source_branch_id = p_destination_branch_id then
    raise exception 'source and destination branch must differ' using errcode = 'P0003';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'a transfer must have at least one item' using errcode = 'P0004';
  end if;

  insert into public.stock_transfers (organization_id, source_branch_id, destination_branch_id, created_by)
  values (p_organization_id, p_source_branch_id, p_destination_branch_id, auth.uid())
  returning * into v_transfer;

  for v_item in
    select *
    from jsonb_to_recordset(p_items) as x(
      source_product_id uuid,
      source_variant_id uuid,
      destination_product_id uuid,
      destination_variant_id uuid,
      quantity numeric
    )
  loop
    if v_item.source_product_id is null or v_item.destination_product_id is null then
      raise exception 'each transfer item requires a source and destination product' using errcode = 'P0004';
    end if;
    if v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'transfer item quantity must be positive' using errcode = 'P0004';
    end if;

    insert into public.stock_transfer_items (
      stock_transfer_id, source_product_id, source_variant_id,
      destination_product_id, destination_variant_id, quantity
    ) values (
      v_transfer.id, v_item.source_product_id, v_item.source_variant_id,
      v_item.destination_product_id, v_item.destination_variant_id, v_item.quantity
    );

    perform public.record_inventory_movement(
      p_source_branch_id, v_item.source_product_id, v_item.source_variant_id,
      'TRANSFER_OUT', -v_item.quantity, null, 'stock_transfer', v_transfer.id
    );

    perform public.record_inventory_movement(
      p_destination_branch_id, v_item.destination_product_id, v_item.destination_variant_id,
      'TRANSFER_IN', v_item.quantity, null, 'stock_transfer', v_transfer.id
    );
  end loop;

  return v_transfer;
end;
$$;

revoke execute on function public.record_inventory_movement(uuid, uuid, uuid, text, numeric, text, text, uuid) from public;
revoke execute on function public.execute_stock_transfer(uuid, uuid, uuid, jsonb) from public;

grant execute on function public.record_inventory_movement(uuid, uuid, uuid, text, numeric, text, text, uuid) to authenticated;
grant execute on function public.execute_stock_transfer(uuid, uuid, uuid, jsonb) to authenticated;
