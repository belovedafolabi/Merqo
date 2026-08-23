-- Milestone 09's atomic ledger primitives. All SECURITY DEFINER, all
-- resolving `created_by` from auth.uid() internally rather than trusting a
-- caller-supplied argument, none re-checking permissions — lib/customers/
-- mutations.ts's requirePermission() calls are the authorization gate,
-- exactly the same division of responsibility record_inventory_movement()
-- and create_sale() already document.
--
-- record_store_credit_entry() is *the* store-credit write path, singular.
-- This milestone's Technical Requirements are explicit that "Store-credit
-- deduction at POS checkout and store-credit issuance from a refund both go
-- through the same shared ledger-write function used here, avoiding a
-- second, inconsistent implementation inside Milestone 08" — so checkout
-- (create_sale()), refund approval (decide_refund()), and manual issue/
-- adjust from the admin screens all call this one function. Milestone 08's
-- capability-only store-credit stub is replaced by it in
-- 20260823130800_alter_sales_functions_add_customer_and_store_credit.sql.
--
-- The concurrency guarantee is the `FOR UPDATE` lock on the account row,
-- identical in shape and reasoning to record_inventory_movement()'s lock on
-- the balance row: a second concurrent spend against the same customer
-- blocks here until the first commits, then reads the first's committed
-- balance — never a lost update, never two spends that each individually
-- looked affordable. This is what this milestone's concurrency test
-- ("two simultaneous attempts to spend the same customer's store credit do
-- not allow spending more than the available balance") exercises.
create or replace function public.record_store_credit_entry(
  p_customer_id uuid,
  p_amount numeric,
  p_entry_type text,
  p_reason text,
  p_reference_type text,
  p_reference_id uuid
)
returns public.store_credit_ledger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_account public.store_credit_accounts;
  v_balance numeric;
  v_new_balance numeric;
  v_entry public.store_credit_ledger;
begin
  if p_amount = 0 then
    raise exception 'a store credit entry must be nonzero' using errcode = 'P0004';
  end if;

  select organization_id into v_organization_id
  from public.customers
  where id = p_customer_id;

  if v_organization_id is null then
    raise exception 'unknown customer %', p_customer_id using errcode = 'P0002';
  end if;

  -- Upsert first so the FOR UPDATE below always has a row to lock, even on
  -- a customer's very first credit entry — the same reason
  -- record_inventory_movement() upserts its balance row before locking it.
  insert into public.store_credit_accounts (customer_id, organization_id)
  values (p_customer_id, v_organization_id)
  on conflict (customer_id) do nothing;

  select * into v_account
  from public.store_credit_accounts
  where customer_id = p_customer_id
  for update;

  v_balance := v_account.balance;
  v_new_balance := v_balance + p_amount;

  -- The overdraw rejection this milestone's Functional Requirements call
  -- for ("Attempting to use more store credit than a customer's derived
  -- balance allows is rejected"), stated in terms of the balance this
  -- transaction has exclusively locked — which is what makes it hold under
  -- concurrent access rather than only in a single-threaded test.
  if v_new_balance < 0 then
    raise exception 'insufficient store credit: % available, % requested', v_balance, -p_amount
      using errcode = 'P0001';
  end if;

  insert into public.store_credit_ledger (
    account_id, entry_type, amount, balance_after, reason,
    reference_type, reference_id, created_by
  ) values (
    v_account.id, p_entry_type, p_amount, v_new_balance, p_reason,
    p_reference_type, p_reference_id, auth.uid()
  )
  returning * into v_entry;

  -- Same transaction as the ledger insert, never a separate best-effort
  -- step — this milestone's Risks section names exactly that as the way a
  -- cached balance drifts from its ledger.
  update public.store_credit_accounts
  set balance = v_new_balance
  where id = v_account.id;

  return v_entry;
end;
$$;

-- Creates a layaway with its items and reserves stock for every line
-- (docs/Customer Management_Store_Credit_and_Layaway.md §27–29). A
-- rejection raised from record_inventory_reservation() (insufficient stock)
-- propagates up and rolls back this entire function's work, including the
-- layaway/layaway_items rows already inserted — Postgres functions are one
-- implicit transaction, the same reasoning create_sale() and
-- execute_stock_transfer() document.
--
-- No `payments` row and no `sales` row is created here, deliberately:
-- §22 is explicit that a part-paid layaway is LAYAWAY_ACTIVE, not
-- SALE_COMPLETED.
create or replace function public.create_layaway(
  p_organization_id uuid,
  p_branch_id uuid,
  p_business_unit_id uuid,
  p_customer_id uuid,
  p_reference text,
  p_total_amount numeric,
  p_items jsonb
)
returns public.layaways
language plpgsql
security definer
set search_path = public
as $$
declare
  v_layaway public.layaways;
  v_item record;
  v_item_business_unit_id uuid;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'a layaway must have at least one item' using errcode = 'P0004';
  end if;

  if not exists (
    select 1 from public.customers
    where id = p_customer_id and organization_id = p_organization_id
  ) then
    raise exception 'customer % does not belong to organization %', p_customer_id, p_organization_id
      using errcode = 'P0002';
  end if;

  insert into public.layaways (
    customer_id, organization_id, branch_id, business_unit_id,
    reference, total_amount, created_by
  ) values (
    p_customer_id, p_organization_id, p_branch_id, p_business_unit_id,
    p_reference, p_total_amount, auth.uid()
  )
  returning * into v_layaway;

  for v_item in
    select *
    from jsonb_to_recordset(p_items) as x(
      product_id uuid,
      variant_id uuid,
      quantity numeric,
      unit_price numeric,
      line_total numeric
    )
  loop
    if v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'layaway item quantity must be positive' using errcode = 'P0004';
    end if;

    -- Never trust that a line's product belongs to the Business Unit the
    -- caller claims to be operating as — identical check, identical
    -- reasoning, to create_sale()'s own.
    select business_unit_id into v_item_business_unit_id
    from public.products
    where id = v_item.product_id;

    if v_item_business_unit_id is null or v_item_business_unit_id <> p_business_unit_id then
      raise exception 'product % does not belong to business unit %', v_item.product_id, p_business_unit_id
        using errcode = 'P0002';
    end if;

    insert into public.layaway_items (
      layaway_id, product_id, variant_id, quantity, unit_price, line_total
    ) values (
      v_layaway.id, v_item.product_id, v_item.variant_id, v_item.quantity,
      v_item.unit_price, v_item.line_total
    );

    perform public.record_inventory_reservation(
      p_branch_id, v_item.product_id, v_item.variant_id, v_item.quantity
    );
  end loop;

  return v_layaway;
end;
$$;

-- Records one immutable installment and, when it clears the balance,
-- completes the layaway: releases each line's reservation and converts it
-- into a real SALE movement, so fulfilment deducts stock exactly once
-- (this milestone's FR: "the layaway is marked complete only when the
-- outstanding balance reaches zero").
--
-- Release-then-deduct, in that order, matters: record_inventory_movement()
-- now refuses to take `quantity` below `reserved_quantity`
-- (20260823130650), so deducting while this layaway's own reservation still
-- stood would have the layaway blocking its own fulfilment.
create or replace function public.record_layaway_payment(
  p_layaway_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text
)
returns public.layaway_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_layaway public.layaways;
  v_new_paid numeric;
  v_payment public.layaway_payments;
  v_item public.layaway_items;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'a layaway payment must be positive' using errcode = 'P0004';
  end if;

  -- Locks the layaway for the same reason record_store_credit_entry() locks
  -- the account: two concurrent installments must not both read the same
  -- stale amount_paid and jointly overpay.
  select * into v_layaway from public.layaways where id = p_layaway_id for update;
  if v_layaway.id is null then
    raise exception 'unknown layaway %', p_layaway_id using errcode = 'P0002';
  end if;
  if v_layaway.status <> 'active' then
    raise exception 'layaway % is % and cannot take further payments', p_layaway_id, v_layaway.status
      using errcode = 'P0001';
  end if;

  v_new_paid := v_layaway.amount_paid + p_amount;
  if v_new_paid > v_layaway.total_amount then
    raise exception 'payment exceeds the % outstanding on this layaway',
      v_layaway.total_amount - v_layaway.amount_paid
      using errcode = 'P0001';
  end if;

  insert into public.layaway_payments (layaway_id, amount, balance_after, method, reference, created_by)
  values (p_layaway_id, p_amount, v_new_paid, p_method, p_reference, auth.uid())
  returning * into v_payment;

  update public.layaways
  set amount_paid = v_new_paid,
      status = case when v_new_paid >= total_amount then 'paid' else status end,
      completed_at = case when v_new_paid >= total_amount then now() else completed_at end
  where id = p_layaway_id;

  if v_new_paid >= v_layaway.total_amount then
    for v_item in select * from public.layaway_items where layaway_id = p_layaway_id
    loop
      perform public.record_inventory_reservation(
        v_layaway.branch_id, v_item.product_id, v_item.variant_id, -v_item.quantity
      );

      perform public.record_inventory_movement(
        v_layaway.branch_id, v_item.product_id, v_item.variant_id,
        'SALE', -v_item.quantity, null, 'layaway', p_layaway_id
      );
    end loop;
  end if;

  return v_payment;
end;
$$;

-- Cancels an active layaway, releasing the stock it was holding. Payments
-- already recorded are left exactly as they are — this milestone's FR
-- ("Each layaway payment is an immutable record") applies to a cancelled
-- layaway too; refunding what was paid is a refund flow, not a deletion.
create or replace function public.cancel_layaway(
  p_layaway_id uuid,
  p_reason text
)
returns public.layaways
language plpgsql
security definer
set search_path = public
as $$
declare
  v_layaway public.layaways;
  v_item public.layaway_items;
begin
  select * into v_layaway from public.layaways where id = p_layaway_id for update;
  if v_layaway.id is null then
    raise exception 'unknown layaway %', p_layaway_id using errcode = 'P0002';
  end if;
  if v_layaway.status <> 'active' then
    raise exception 'layaway % is already %', p_layaway_id, v_layaway.status using errcode = 'P0001';
  end if;

  for v_item in select * from public.layaway_items where layaway_id = p_layaway_id
  loop
    perform public.record_inventory_reservation(
      v_layaway.branch_id, v_item.product_id, v_item.variant_id, -v_item.quantity
    );
  end loop;

  update public.layaways
  set status = 'cancelled',
      cancellation_reason = p_reason,
      cancelled_at = now()
  where id = p_layaway_id
  returning * into v_layaway;

  return v_layaway;
end;
$$;

revoke execute on function public.record_store_credit_entry(uuid, numeric, text, text, text, uuid) from public;
revoke execute on function public.create_layaway(uuid, uuid, uuid, uuid, text, numeric, jsonb) from public;
revoke execute on function public.record_layaway_payment(uuid, numeric, text, text) from public;
revoke execute on function public.cancel_layaway(uuid, text) from public;

grant execute on function public.record_store_credit_entry(uuid, numeric, text, text, text, uuid) to authenticated;
grant execute on function public.create_layaway(uuid, uuid, uuid, uuid, text, numeric, jsonb) to authenticated;
grant execute on function public.record_layaway_payment(uuid, numeric, text, text) to authenticated;
grant execute on function public.cancel_layaway(uuid, text) to authenticated;
