-- The atomic sale/return/refund primitives this milestone's Technical
-- Requirements call for: "the entire sale-creation flow executes inside a
-- single database transaction with row-level locking sufficient to prevent
-- overselling under concurrent access" and "a retried sale request never
-- creates a duplicate sale." All four functions are `SECURITY DEFINER`
-- (same pattern as record_inventory_movement()/execute_stock_transfer()) and
-- none re-check permissions themselves — lib/sales/mutations.ts's
-- requirePermission() calls are the authorization gate, exactly the same
-- division of responsibility record_inventory_movement()'s own comment
-- documents. Pricing/discount/tax/service-charge amounts arrive already
-- resolved and calculated (lib/sales/calculations.ts, resolveEffectivePrice())
-- — these functions perform the atomic write + the one thing that cannot
-- safely happen anywhere else (the stock-locking deduction), not
-- calculation.
--
-- create_sale() reuses record_inventory_movement() unchanged for its
-- concurrency guarantee (docs/TAS.md §18: "inventory validation and
-- inventory deduction must occur atomically") — that function's own
-- `FOR UPDATE` row lock, already proven correct by Milestone 07's
-- concurrency suite, is never re-implemented here. A rejection raised from
-- within it (insufficient stock) propagates up and rolls back this entire
-- function's work, including the `sales`/`sale_items` rows already
-- inserted earlier in the same call — Postgres functions are one implicit
-- transaction, same reasoning as execute_stock_transfer().
create or replace function public.create_sale(
  p_organization_id uuid,
  p_branch_id uuid,
  p_business_unit_id uuid,
  p_idempotency_key text,
  p_items jsonb,
  p_subtotal numeric,
  p_discount_amount numeric,
  p_discount_reason text,
  p_tax_amount numeric,
  p_service_charge_amount numeric,
  p_total numeric,
  p_payment_method text,
  p_payment_amount numeric,
  p_payment_reference text
)
returns public.sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales;
  v_item record;
  v_item_business_unit_id uuid;
begin
  -- Idempotency (this milestone's Technical Requirements): an atomic
  -- check-and-insert via `on conflict ... do nothing`, not a separate
  -- SELECT-then-INSERT that a retried concurrent request could race past.
  -- A no-op insert means a sale with this key already exists — return it
  -- unchanged rather than creating (or attempting to create) a second one.
  insert into public.sales (
    organization_id, branch_id, business_unit_id, idempotency_key,
    subtotal, discount_amount, discount_reason, tax_amount,
    service_charge_amount, total, created_by
  ) values (
    p_organization_id, p_branch_id, p_business_unit_id, p_idempotency_key,
    p_subtotal, p_discount_amount, p_discount_reason, p_tax_amount,
    p_service_charge_amount, p_total, auth.uid()
  )
  on conflict (idempotency_key) do nothing
  returning * into v_sale;

  if v_sale.id is null then
    select * into v_sale from public.sales where idempotency_key = p_idempotency_key;
    return v_sale;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'a sale must have at least one item' using errcode = 'P0004';
  end if;

  for v_item in
    select *
    from jsonb_to_recordset(p_items) as x(
      product_id uuid,
      variant_id uuid,
      quantity numeric,
      unit_price numeric,
      line_discount numeric,
      line_total numeric
    )
  loop
    if v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'sale item quantity must be positive' using errcode = 'P0004';
    end if;

    -- Never trust that a cart line's product actually belongs to the
    -- Business Unit the checkout session claims to be operating as — same
    -- "derive/verify, don't trust the caller" reasoning as
    -- record_inventory_movement()'s own business_unit_id lookup, one level
    -- stricter here since create_sale() additionally receives
    -- p_business_unit_id as an explicit argument rather than only deriving
    -- one internally.
    select business_unit_id into v_item_business_unit_id
    from public.products
    where id = v_item.product_id;

    if v_item_business_unit_id is null or v_item_business_unit_id <> p_business_unit_id then
      raise exception 'product % does not belong to business unit %', v_item.product_id, p_business_unit_id
        using errcode = 'P0002';
    end if;

    insert into public.sale_items (
      sale_id, product_id, variant_id, quantity, unit_price, line_discount, line_total
    ) values (
      v_sale.id, v_item.product_id, v_item.variant_id, v_item.quantity,
      v_item.unit_price, v_item.line_discount, v_item.line_total
    );

    perform public.record_inventory_movement(
      p_branch_id, v_item.product_id, v_item.variant_id, 'SALE', -v_item.quantity, null, 'sale', v_sale.id
    );
  end loop;

  insert into public.payments (sale_id, method, amount, reference, created_by)
  values (v_sale.id, p_payment_method, p_payment_amount, p_payment_reference, auth.uid());

  return v_sale;
end;
$$;

-- Reverses inventory via a RETURN movement (this milestone's Scope: "not a
-- raw stock edit") and enforces that a sale item can never be over-returned
-- across multiple separate return transactions, by summing everything
-- already recorded against it. `organization_id`/`branch_id` are derived
-- from the sale row itself, never accepted as caller-supplied arguments —
-- the same reasoning create_sale()'s business-unit check above documents.
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

    perform public.record_inventory_movement(
      v_sale.branch_id, v_sale_item.product_id, v_sale_item.variant_id,
      'RETURN', v_item.quantity, v_item.reason, 'return', v_return.id
    );
  end loop;

  return v_return;
end;
$$;

-- Records a refund *request* only — always 'pending', never itself the
-- authorization step (this milestone's Security Requirements: "a distinct,
-- auditable step from refund initiation"). `organization_id`/`branch_id`
-- are derived from the sale row, same reasoning as create_return() above.
create or replace function public.request_refund(
  p_sale_id uuid,
  p_return_id uuid,
  p_amount numeric,
  p_method text,
  p_reason text
)
returns public.refunds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales;
  v_refund public.refunds;
begin
  select * into v_sale from public.sales where id = p_sale_id;
  if v_sale.id is null then
    raise exception 'unknown sale %', p_sale_id using errcode = 'P0002';
  end if;

  insert into public.refunds (
    sale_id, return_id, organization_id, branch_id, amount, method, reason, status, initiated_by
  ) values (
    p_sale_id, p_return_id, v_sale.organization_id, v_sale.branch_id, p_amount, p_method, p_reason,
    'pending', auth.uid()
  )
  returning * into v_refund;

  return v_refund;
end;
$$;

-- The one legal status transition path for `refunds` (no UPDATE grant for
-- `authenticated` — 20260823121400_alter_refunds_add_policies.sql) — mirrors
-- record_inventory_movement()'s "the RPC is the only write path" shape.
-- Whether the *current* session is even allowed to call this at all is
-- `refund.approve`, checked by lib/sales/mutations.ts's approveRefund()
-- before this RPC is ever invoked — a Cashier role never holds that
-- permission (supabase/seed.sql), so a same-person refund is only possible
-- for a role (Owner) whose own permission grants already make that "policy
-- allows it," per this milestone's own plan doc.
create or replace function public.decide_refund(
  p_refund_id uuid,
  p_approved boolean
)
returns public.refunds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund public.refunds;
begin
  select * into v_refund from public.refunds where id = p_refund_id;
  if v_refund.id is null then
    raise exception 'unknown refund %', p_refund_id using errcode = 'P0002';
  end if;
  if v_refund.status <> 'pending' then
    raise exception 'refund % has already been decided', p_refund_id using errcode = 'P0001';
  end if;

  update public.refunds
  set status = case when p_approved then 'approved' else 'rejected' end,
      authorized_by = auth.uid(),
      decided_at = now()
  where id = p_refund_id
  returning * into v_refund;

  return v_refund;
end;
$$;

revoke execute on function public.create_sale(uuid, uuid, uuid, text, jsonb, numeric, numeric, text, numeric, numeric, numeric, text, numeric, text) from public;
revoke execute on function public.create_return(uuid, text, jsonb) from public;
revoke execute on function public.request_refund(uuid, uuid, numeric, text, text) from public;
revoke execute on function public.decide_refund(uuid, boolean) from public;

grant execute on function public.create_sale(uuid, uuid, uuid, text, jsonb, numeric, numeric, text, numeric, numeric, numeric, text, numeric, text) to authenticated;
grant execute on function public.create_return(uuid, text, jsonb) to authenticated;
grant execute on function public.request_refund(uuid, uuid, numeric, text, text) to authenticated;
grant execute on function public.decide_refund(uuid, boolean) to authenticated;
