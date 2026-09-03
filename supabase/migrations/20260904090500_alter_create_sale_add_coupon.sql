-- create_sale() gains p_coupon_id: validate the coupon under a row lock, bump
-- its redemption_count, and stamp sales.coupon_id — all inside the same
-- transaction as the sale, so a coupon at its redemption cap cannot be
-- redeemed twice by two concurrent checkouts.
--
-- Body is verbatim from 20260823140700 (the current definition) except:
--   * a new trailing argument `p_coupon_id uuid default null`;
--   * a coupon block, placed AFTER the idempotency early-return so a retried
--     checkout never double-counts a redemption;
--   * `coupon_id` added to the sales INSERT column list.
--
-- The coupon's discount AMOUNT is not computed here — lib/sales/mutations.ts
-- resolves it and folds it into p_discount_amount before calling, the same
-- division of labour every other amount in this signature follows ("these
-- functions perform the atomic write, not calculation" — 20260823120800's
-- header). What must be atomic with the write is the redemption-cap check and
-- the counter increment, and that is what lives here.
--
-- Drop-and-recreate rather than an overload: one canonical signature, one
-- grant. lib/sales/mutations.ts's rpc('create_sale', ...) is updated in the
-- same change to pass p_coupon_id.

drop function if exists public.create_sale(
  uuid, uuid, uuid, text, jsonb, numeric, numeric, text, numeric, numeric, numeric, text, numeric, text, uuid
);

create function public.create_sale(
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
  p_customer_id uuid,
  p_coupon_id uuid default null
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
  v_unit_cost numeric;
  v_coupon public.coupons;
begin
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

  insert into public.sales (
    organization_id, branch_id, business_unit_id, customer_id, coupon_id, idempotency_key,
    subtotal, discount_amount, discount_reason, tax_amount,
    service_charge_amount, total, created_by
  ) values (
    p_organization_id, p_branch_id, p_business_unit_id, p_customer_id, p_coupon_id, p_idempotency_key,
    p_subtotal, p_discount_amount, p_discount_reason, p_tax_amount,
    p_service_charge_amount, p_total, auth.uid()
  )
  on conflict (idempotency_key) do nothing
  returning * into v_sale;

  if v_sale.id is null then
    select * into v_sale from public.sales where idempotency_key = p_idempotency_key;
    return v_sale;
  end if;

  -- Coupon: lock the row, re-check it is still redeemable, count the
  -- redemption. After the idempotency return above, so a retry cannot bump
  -- the counter a second time. The discount amount itself is already in
  -- p_discount_amount.
  if p_coupon_id is not null then
    select * into v_coupon
    from public.coupons
    where id = p_coupon_id and organization_id = p_organization_id
    for update;

    if v_coupon.id is null then
      raise exception 'unknown coupon %', p_coupon_id using errcode = 'P0002';
    end if;
    if v_coupon.archived_at is not null then
      raise exception 'coupon % is no longer active', p_coupon_id using errcode = 'P0004';
    end if;
    if v_coupon.starts_at is not null and now() < v_coupon.starts_at then
      raise exception 'coupon % is not active yet', p_coupon_id using errcode = 'P0004';
    end if;
    if v_coupon.expires_at is not null and now() >= v_coupon.expires_at then
      raise exception 'coupon % has expired', p_coupon_id using errcode = 'P0004';
    end if;
    if p_subtotal < v_coupon.minimum_purchase then
      raise exception 'coupon % requires a minimum purchase of %', p_coupon_id, v_coupon.minimum_purchase
        using errcode = 'P0004';
    end if;
    if v_coupon.max_redemptions is not null
       and v_coupon.redemption_count >= v_coupon.max_redemptions then
      raise exception 'coupon % has reached its redemption limit', p_coupon_id using errcode = 'P0004';
    end if;

    update public.coupons
    set redemption_count = redemption_count + 1
    where id = p_coupon_id;
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

    select business_unit_id into v_item_business_unit_id
    from public.products
    where id = v_item.product_id;

    if v_item_business_unit_id is null or v_item_business_unit_id <> p_business_unit_id then
      raise exception 'product % does not belong to business unit %', v_item.product_id, p_business_unit_id
        using errcode = 'P0002';
    end if;

    select coalesce(pv.cost_price, p.cost_price, 0) into v_unit_cost
    from public.products p
    left join public.product_variants pv
      on pv.id = v_item.variant_id
    where p.id = v_item.product_id;

    insert into public.sale_items (
      sale_id, product_id, variant_id, quantity, unit_price, line_discount, line_total, unit_cost
    ) values (
      v_sale.id, v_item.product_id, v_item.variant_id, v_item.quantity,
      v_item.unit_price, v_item.line_discount, v_item.line_total, coalesce(v_unit_cost, 0)
    );

    perform public.record_inventory_movement(
      p_branch_id, v_item.product_id, v_item.variant_id, 'SALE', -v_item.quantity, null, 'sale', v_sale.id
    );
  end loop;

  insert into public.payments (sale_id, method, amount, reference, created_by)
  values (v_sale.id, p_payment_method, p_payment_amount, p_payment_reference, auth.uid());

  if p_payment_method = 'store_credit' then
    perform public.record_store_credit_entry(
      p_customer_id, -p_payment_amount, 'spend', null, 'sale', v_sale.id
    );
  end if;

  return v_sale;
end;
$$;

revoke execute on function public.create_sale(
  uuid, uuid, uuid, text, jsonb, numeric, numeric, text, numeric, numeric, numeric, text, numeric, text, uuid, uuid
) from public;
grant execute on function public.create_sale(
  uuid, uuid, uuid, text, jsonb, numeric, numeric, text, numeric, numeric, numeric, text, numeric, text, uuid, uuid
) to authenticated;
