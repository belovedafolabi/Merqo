-- Replaces Milestone 08's store-credit stub with this milestone's real
-- ledger, per its Definition of Done: "Milestone 08's store-credit checkout
-- stub is reconciled to call this milestone's real ledger functions with no
-- duplicated logic remaining." Before this migration, `payment_method =
-- 'store_credit'` recorded a `payments` row and nothing else — no balance
-- existed to check, so a customer could "pay" with credit they never had.
--
-- The old create_sale() is DROPped rather than left alongside the new one.
-- Appending p_customer_id would create a second overload with a different
-- arity, leaving M08's balance-blind version callable forever — precisely
-- the "two parallel implementations" this milestone's Implementation Notes
-- forbid. Dropping it means any missed call site fails loudly at once
-- instead of silently taking the old path.
drop function if exists public.create_sale(uuid, uuid, uuid, text, jsonb, numeric, numeric, text, numeric, numeric, numeric, text, numeric, text);

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
  p_payment_reference text,
  p_customer_id uuid
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
  -- Store credit is drawn against a *customer*, so a store-credit sale
  -- without one is rejected here rather than being allowed to fall through
  -- to an untracked payment. This is why sales.customer_id stays nullable
  -- table-wide (20260823130600) — the requirement is per-payment-method,
  -- not per-sale.
  if p_payment_method = 'store_credit' and p_customer_id is null then
    raise exception 'a store credit sale requires a customer' using errcode = 'P0004';
  end if;

  if p_customer_id is not null and not exists (
    select 1 from public.customers
    where id = p_customer_id and organization_id = p_organization_id
  ) then
    raise exception 'customer % does not belong to organization %', p_customer_id, p_organization_id
      using errcode = 'P0002';
  end if;

  -- Idempotency (Milestone 08's Technical Requirements): an atomic
  -- check-and-insert via `on conflict ... do nothing`, not a separate
  -- SELECT-then-INSERT that a retried concurrent request could race past.
  -- A no-op insert means a sale with this key already exists — return it
  -- unchanged rather than creating (or attempting to create) a second one.
  -- This early return is also what stops a retried store-credit checkout
  -- from deducting the balance twice.
  insert into public.sales (
    organization_id, branch_id, business_unit_id, customer_id, idempotency_key,
    subtotal, discount_amount, discount_reason, tax_amount,
    service_charge_amount, total, created_by
  ) values (
    p_organization_id, p_branch_id, p_business_unit_id, p_customer_id, p_idempotency_key,
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
    -- record_inventory_movement()'s own business_unit_id lookup.
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

  -- The deduction, inside the same transaction as the sale
  -- (docs/API_and_Application_Contract.md §32: "The store-credit balance
  -- must be validated and deducted atomically with the sale"). There is no
  -- separate balance check before this line: record_store_credit_entry()
  -- locks the account and raises on an overdraw, which rolls back the sale,
  -- its items, and the stock deducted above. A check-then-deduct pair would
  -- reintroduce exactly the race the lock exists to close.
  --
  -- The full total, never a partial amount — store credit is all-or-nothing
  -- here, consistent with Milestone 08's explicit exclusion of split
  -- payments. A balance that cannot cover the total fails the sale.
  if p_payment_method = 'store_credit' then
    perform public.record_store_credit_entry(
      p_customer_id, -p_payment_amount, 'spend', null, 'sale', v_sale.id
    );
  end if;

  return v_sale;
end;
$$;

-- Approving a store-credit refund now issues real credit through the same
-- shared ledger function (this milestone's Technical Requirements: issuance
-- from a refund and deduction at checkout "both go through the same shared
-- ledger-write function"). Before this migration an approved store-credit
-- refund changed a status and nothing else — the credit it promised the
-- customer existed nowhere.
--
-- Issuance happens on approval, not on request: a 'pending' refund is not
-- yet an authorized one (Milestone 08's Security Requirements), and issuing
-- credit for one would let a Cashier mint balance without a Manager.
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
  v_customer_id uuid;
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

  if p_approved and v_refund.method = 'store_credit' then
    select customer_id into v_customer_id from public.sales where id = v_refund.sale_id;

    if v_customer_id is null then
      raise exception 'cannot refund to store credit: sale % has no customer', v_refund.sale_id
        using errcode = 'P0004';
    end if;

    perform public.record_store_credit_entry(
      v_customer_id, v_refund.amount, 'refund_to_credit', v_refund.reason, 'refund', v_refund.id
    );
  end if;

  return v_refund;
end;
$$;

revoke execute on function public.create_sale(uuid, uuid, uuid, text, jsonb, numeric, numeric, text, numeric, numeric, numeric, text, numeric, text, uuid) from public;
grant execute on function public.create_sale(uuid, uuid, uuid, text, jsonb, numeric, numeric, text, numeric, numeric, numeric, text, numeric, text, uuid) to authenticated;
