-- Populates the `sale_items.unit_cost` snapshot added in
-- 20260823140600_alter_sale_items_add_unit_cost.sql, so every sale written
-- from this migration forward carries its own cost basis and Milestone 10's
-- COGS never has to read live `products.cost_price`.
--
-- This is a `create or replace` of the CURRENT create_sale(), whose body
-- comes from 20260823130800_alter_sales_functions_add_customer_and_store_credit.sql
-- — Milestone 09 already dropped and replaced Milestone 08's original
-- 14-argument version. The signature is unchanged (same 15 arguments, same
-- order), so lib/sales/mutations.ts's rpc call and the whole checkout path
-- are untouched by this migration; no drop is needed and no second overload
-- can appear.
--
-- The cost lookup lives inside the existing item loop, next to the
-- business-unit verification that is already there, for the same reason that
-- check is there: the caller supplies the cart, and the caller is not trusted
-- to supply cost. Unlike `unit_price` — which is resolved server-side by
-- Milestone 06's resolveEffectivePrice() before this function is ever called,
-- because a price depends on branch overrides and promotions the database
-- does not model — cost has exactly one source of truth already in the
-- database, so reading it here is both simpler and safer than adding another
-- field the client could get wrong. It is deliberately NOT added to the
-- p_items jsonb payload.
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
  v_unit_cost numeric;
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

    -- Cost basis, snapshotted. Same variant-then-product fallback as
    -- lib/inventory/queries.ts: a variant may carry its own cost (nullable)
    -- and inherits its parent product's when it does not.
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
