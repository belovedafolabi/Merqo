-- Milestone 17 Part B — three new à-la-carte capabilities, plus the sale-path
-- change the first of them needs.
--
--   services      — sell non-stock service line items (salon, barber, hotel,
--                   general services). A "service" product carries
--                   track_inventory = false (20260906090300); create_sale()
--                   and lib/sales/mutations.ts's assertStockAvailable() skip
--                   the stock path for it. This is a deliberate, product-owner-
--                   confirmed exception to Part B's "configuration only" rule
--                   — it needs a column and a money-path edit, not just a flag.
--   quick_sale    — a fast keypad / no-scan checkout mode (bakery, convenience,
--                   general retail). UI-only, no schema.
--   weighed_items — fractional-quantity line items priced per unit weight
--                   (bakery, deli, wholesale). sale_items.quantity is already
--                   numeric(14,3), so this is a POS input/validation capability,
--                   no schema.
--
-- Every capability stays independently toggleable per business unit regardless
-- of type, exactly like the existing seven — the business_unit_capabilities
-- override mechanism is untouched.

insert into public.capabilities (key, name, description) values
  ('services', 'Services', 'Sell non-stock service line items — a haircut, a room-service charge, a delivery fee. A service product is not tracked in inventory.'),
  ('quick_sale', 'Quick Sale', 'A fast keypad checkout mode for busy counters where most items are not scanned.'),
  ('weighed_items', 'Weighed Items', 'Allow fractional quantities on a line, for goods priced by weight.')
on conflict (key) do nothing;

-- Default matrix rows. `true` where the vertical obviously wants it; the
-- cross-join below fills every remaining (type, capability) pair with `false`
-- so the matrix stays complete (13 x 10 = 130). Mirrored in supabase/seed.sql.
with matrix (business_type_slug, capability_key) as (
  values
    ('restaurant', 'services'),
    ('beauty_salons_barbers', 'services'),
    ('hotels', 'services'),
    ('general_retail', 'services'),

    ('convenience_store', 'quick_sale'),
    ('bakeries', 'quick_sale'),
    ('general_retail', 'quick_sale'),
    ('supermarket', 'quick_sale'),

    ('bakeries', 'weighed_items'),
    ('supermarket', 'weighed_items'),
    ('wholesalers', 'weighed_items')
)
insert into public.business_type_capabilities (business_type_id, capability_id, default_enabled)
select bt.id, c.id, true
from matrix m
join public.business_types bt on bt.slug = m.business_type_slug
join public.capabilities c on c.key = m.capability_key
on conflict (business_type_id, capability_id) do nothing;

insert into public.business_type_capabilities (business_type_id, capability_id, default_enabled)
select bt.id, c.id, false
from public.business_types bt
cross join public.capabilities c
on conflict (business_type_id, capability_id) do nothing;

-- Backfill existing business units. seed_business_unit_capabilities()
-- (20260822090800) only copies the type defaults on INSERT, so units created
-- before this migration have no row for the three new capabilities. Add them
-- at each unit's type default, is_override = false.
insert into public.business_unit_capabilities
  (business_unit_id, capability_id, enabled, is_override, created_by)
select bu.id, btc.capability_id, btc.default_enabled, false, bu.created_by
from public.business_units bu
join public.business_type_capabilities btc on btc.business_type_id = bu.business_type_id
join public.capabilities c on c.id = btc.capability_id
where c.key in ('services', 'quick_sale', 'weighed_items')
on conflict (business_unit_id, capability_id) do nothing;

-- ---------------------------------------------------------------------------
-- create_sale(): skip the stock deduction for a non-tracked product.
--
-- Body is verbatim from 20260904090500 (the current definition) except:
--   * v_track_inventory is fetched alongside the existing business_unit_id
--     look-up in the item loop;
--   * the record_inventory_movement() call is wrapped in
--     `if v_track_inventory then ... end if`.
-- Nothing else changes — the FOR UPDATE guarantee for tracked products is
-- untouched. Drop-and-recreate on the same 16-arg signature, one grant.
-- ---------------------------------------------------------------------------
drop function if exists public.create_sale(
  uuid, uuid, uuid, text, jsonb, numeric, numeric, text, numeric, numeric, numeric, text, numeric, text, uuid, uuid
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
  v_track_inventory boolean;
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

    select business_unit_id, track_inventory
      into v_item_business_unit_id, v_track_inventory
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

    -- Milestone 17 Part B: a non-tracked product (a service line item) has no
    -- inventory to move.
    if v_track_inventory then
      perform public.record_inventory_movement(
        p_branch_id, v_item.product_id, v_item.variant_id, 'SALE', -v_item.quantity, null, 'sale', v_sale.id
      );
    end if;
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
