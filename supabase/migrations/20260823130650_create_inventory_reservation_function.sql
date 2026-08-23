-- Gives inventory_balances.reserved_quantity the write path
-- 20260823110000_create_inventory_balances.sql explicitly left for later
-- ("schema-ready for... checkout-time stock reservation, but no mutation
-- path in this milestone ever writes a nonzero value to it").
--
-- Milestone 09 is what needs it: docs/Customer Management_Store_Credit_and_
-- Layaway.md §27–29 makes reserve-at-layaway-creation an explicit
-- architectural recommendation — without it, a customer can part-pay a
-- ₦500,000 TV and have another customer buy the last one out from under
-- them. create_layaway() reserves per line; record_layaway_payment()
-- releases and converts to a real SALE movement on completion;
-- cancel_layaway() releases (20260823130700_create_customer_functions.sql).
--
-- Structurally this is record_inventory_movement()'s sibling and follows it
-- line for line — upsert so there is always a row to lock, `FOR UPDATE` as
-- the entire concurrency guarantee, `auth.uid()` resolved internally rather
-- than trusted from the caller, and no permission re-check (lib/customers/
-- mutations.ts's requirePermission() is the authorization gate, the same
-- division of responsibility record_inventory_movement()'s own comment
-- documents).
--
-- It deliberately does NOT write an inventory_movements row: a reservation
-- moves nothing. On-hand `quantity` is unchanged; only `available_quantity`
-- (the generated column) drops. Recording a movement for it would put
-- phantom stock changes in the movement history that never happened, and
-- would double-count against the real SALE movement written at fulfilment.
-- That is also why it takes no reference_type/reference_id: with no row
-- written, there would be nothing to record them on — the layaway that owns
-- a reservation is already discoverable from layaway_items.
create or replace function public.record_inventory_reservation(
  p_branch_id uuid,
  p_product_id uuid,
  p_variant_id uuid,
  p_quantity_delta numeric
)
returns public.inventory_balances
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_unit_id uuid;
  v_balance public.inventory_balances;
  v_new_reserved numeric;
begin
  if p_quantity_delta = 0 then
    raise exception 'a reservation change must be nonzero' using errcode = 'P0004';
  end if;

  select business_unit_id into v_business_unit_id
  from public.products
  where id = p_product_id;

  if v_business_unit_id is null then
    raise exception 'unknown product %', p_product_id using errcode = 'P0002';
  end if;

  insert into public.inventory_balances (branch_id, business_unit_id, product_id, variant_id)
  values (p_branch_id, v_business_unit_id, p_product_id, p_variant_id)
  on conflict (branch_id, product_id, variant_id) do nothing;

  select * into v_balance
  from public.inventory_balances
  where branch_id = p_branch_id
    and product_id = p_product_id
    and variant_id is not distinct from p_variant_id
  for update;

  v_new_reserved := v_balance.reserved_quantity + p_quantity_delta;

  if v_new_reserved < 0 then
    raise exception 'cannot release more than the % reserved for this product', v_balance.reserved_quantity
      using errcode = 'P0001';
  end if;

  -- Reserving beyond what is actually on hand is the case this whole
  -- function exists to prevent — a layaway may only be promised against
  -- stock that exists and isn't already promised to someone else.
  if v_new_reserved > v_balance.quantity then
    raise exception 'insufficient stock to reserve: % on hand, % already reserved, % requested',
      v_balance.quantity, v_balance.reserved_quantity, p_quantity_delta
      using errcode = 'P0001';
  end if;

  update public.inventory_balances
  set reserved_quantity = v_new_reserved
  where id = v_balance.id
  returning * into v_balance;

  return v_balance;
end;
$$;

-- record_inventory_movement()'s outbound guard now respects reservations.
--
-- Before this migration it compared the post-movement `quantity` against
-- zero, which meant a reserved unit was still sellable at the till — the
-- exact failure §28 of the corpus describes. It now compares against
-- `reserved_quantity` as well, so stock promised to a layaway cannot be sold
-- out from under it.
--
-- This is behaviour-preserving for everything shipped before Milestone 09:
-- `reserved_quantity` is 0 on every existing row and no pre-existing code
-- path writes a nonzero value, so Milestone 07's and 08's concurrency suites
-- exercise the identical comparison they always did. Redefined here in full
-- rather than patched in place because Postgres has no partial function
-- edit; the only changed lines are the reserved-quantity read and the guard
-- below it.
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
  v_reserved_quantity numeric;
  v_new_quantity numeric;
  v_movement public.inventory_movements;
begin
  select business_unit_id into v_business_unit_id
  from public.products
  where id = p_product_id;

  if v_business_unit_id is null then
    raise exception 'unknown product %', p_product_id using errcode = 'P0002';
  end if;

  insert into public.inventory_balances (branch_id, business_unit_id, product_id, variant_id)
  values (p_branch_id, v_business_unit_id, p_product_id, p_variant_id)
  on conflict (branch_id, product_id, variant_id) do nothing;

  select quantity, reserved_quantity into v_current_quantity, v_reserved_quantity
  from public.inventory_balances
  where branch_id = p_branch_id
    and product_id = p_product_id
    and variant_id is not distinct from p_variant_id
  for update;

  v_new_quantity := v_current_quantity + p_quantity_delta;
  if v_new_quantity < v_reserved_quantity then
    raise exception 'insufficient stock: % available, % requested',
      v_current_quantity - v_reserved_quantity, p_quantity_delta
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

revoke execute on function public.record_inventory_reservation(uuid, uuid, uuid, numeric) from public;
grant execute on function public.record_inventory_reservation(uuid, uuid, uuid, numeric) to authenticated;
