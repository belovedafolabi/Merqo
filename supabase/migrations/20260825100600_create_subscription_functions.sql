-- The subscription/pricing/payment RPCs
-- (docs/milestones/13-subscription-billing-and-platform-admin.md API/Backend
-- Changes: "Server Actions: Super Admin pricing configuration CRUD; Owner
-- subscription-checkout initiation").
--
-- billing_period_interval() centralizes the month arithmetic so it is
-- written once. Postgres' `+ interval '1 mon'` normalizes day overflow
-- (Jan 31 + 1 mon -> Feb 28/29) correctly, which hand-rolled day math does
-- not — see apply_subscription_payment() below.
create or replace function public.billing_period_interval(p_billing_period text)
returns interval
language sql
immutable
as $$
  select case p_billing_period
    when 'MONTHLY' then interval '1 mon'
    when 'QUARTERLY' then interval '3 mon'
    when 'SEMI_ANNUAL' then interval '6 mon'
    when 'ANNUAL' then interval '1 year'
    else null
  end;
$$;

-- The price list is not secret — the Owner must see it before renewing — so
-- this carries no permission check, only the RLS-equivalent grant to
-- authenticated below.
create or replace function public.get_subscription_pricing()
returns table (
  billing_period text,
  price_minor bigint,
  currency text,
  is_active boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select billing_period, price_minor, currency, is_active
  from public.subscription_pricing
  order by
    case billing_period
      when 'MONTHLY' then 1
      when 'QUARTERLY' then 2
      when 'SEMI_ANNUAL' then 3
      when 'ANNUAL' then 4
    end;
$$;

revoke execute on function public.get_subscription_pricing() from public;
grant execute on function public.get_subscription_pricing() to authenticated;

-- Resolves the caller's single organization to pass to user_has_permission()
-- — subscription_pricing has no organization_id column of its own (it is
-- global), so this reuses the existing permission machinery rather than
-- inventing a second, platform-only authorization concept for one screen.
create or replace function public.set_subscription_price(
  p_billing_period text,
  p_price_minor bigint,
  p_currency text default 'NGN'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_id uuid;
begin
  select organization_id into v_organization_id
  from public.user_roles where user_id = auth.uid() limit 1;

  if v_organization_id is null
     or not public.user_has_permission('platform.manage_pricing', v_organization_id) then
    raise exception 'permission denied: platform.manage_pricing' using errcode = '42501';
  end if;

  insert into public.subscription_pricing (billing_period, price_minor, currency, updated_by)
  values (p_billing_period, p_price_minor, p_currency, auth.uid())
  on conflict (billing_period)
  do update set
    price_minor = excluded.price_minor,
    currency = excluded.currency,
    updated_by = excluded.updated_by
  returning id into v_id;

  perform public.record_audit_event(
    v_organization_id, auth.uid(), 'subscription.pricing_updated', 'subscription_pricing', v_id,
    jsonb_build_object('billing_period', p_billing_period, 'price_minor', p_price_minor, 'currency', p_currency)
  );

  return v_id;
end;
$$;

revoke execute on function public.set_subscription_price(text, bigint, text) from public;
grant execute on function public.set_subscription_price(text, bigint, text) to authenticated;

-- Writes the PENDING subscription_payments row at checkout initiation — see
-- that table's comment (20260825100200) for why this precedes ever reaching
-- Paystack. Resolves the expected amount/currency from subscription_pricing
-- itself (server-side), never from a caller-supplied amount.
create or replace function public.initiate_subscription_payment(
  p_organization_id uuid,
  p_billing_period text,
  p_reference text
)
returns table (
  payment_id uuid,
  subscription_id uuid,
  amount_minor bigint,
  currency text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price record;
  v_subscription_id uuid;
  v_payment_id uuid;
begin
  if not public.user_has_permission('subscription.renew', p_organization_id) then
    raise exception 'permission denied: subscription.renew' using errcode = '42501';
  end if;

  -- Table-qualified, not bare `currency` — this function's own OUT
  -- parameter (returns table (..., currency text)) is implicitly in scope
  -- as a plpgsql variable throughout the function body, so an unqualified
  -- `currency` here is ambiguous between that variable and the column.
  select sp.price_minor, sp.currency into v_price
  from public.subscription_pricing sp
  where sp.billing_period = p_billing_period and sp.is_active;

  if v_price is null then
    raise exception 'no active price configured for billing_period %', p_billing_period;
  end if;

  select id into v_subscription_id
  from public.subscriptions where organization_id = p_organization_id;

  if v_subscription_id is null then
    raise exception 'organization % has no subscription row', p_organization_id;
  end if;

  insert into public.subscription_payments (
    organization_id, subscription_id, paystack_reference,
    billing_period, amount_minor, currency, initiated_by
  )
  values (
    p_organization_id, v_subscription_id, p_reference,
    p_billing_period, v_price.price_minor, v_price.currency, auth.uid()
  )
  returning id into v_payment_id;

  perform public.record_audit_event(
    p_organization_id, auth.uid(), 'subscription.checkout_initiated', 'subscription_payment', v_payment_id,
    jsonb_build_object('billing_period', p_billing_period, 'amount_minor', v_price.price_minor)
  );

  return query select v_payment_id, v_subscription_id, v_price.price_minor, v_price.currency;
end;
$$;

revoke execute on function public.initiate_subscription_payment(uuid, text, text) from public;
grant execute on function public.initiate_subscription_payment(uuid, text, text) to authenticated;

-- Persists the authorization_url Paystack returns, so a browser refresh
-- before completing checkout can still find it. Not permission-checked
-- again: the caller already passed initiate_subscription_payment()'s check
-- to have a payment_id, and this only ever runs immediately after that call
-- within the same mutation (lib/subscription/mutations.ts).
create or replace function public.record_payment_authorization_url(
  p_payment_id uuid,
  p_authorization_url text
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.subscription_payments
  set authorization_url = p_authorization_url
  where id = p_payment_id;
$$;

revoke execute on function public.record_payment_authorization_url(uuid, text) from public;
grant execute on function public.record_payment_authorization_url(uuid, text) to authenticated;

-- The one read lib/subscription/settlement.ts needs before it can decide
-- whether Paystack's verification response matches what was expected.
-- service_role ONLY, same as every other function below — subscription_
-- payments has no SELECT grant to service_role (20260825100900: table
-- grants are authenticated-only, by design, since every real write and read
-- from server-side code goes through an RPC, never a direct
-- .from().select()/.update() call). A caller here holding only the
-- service-role key (no session, e.g. the Paystack webhook) would otherwise
-- get a silent permission-denied on a direct table read.
create or replace function public.get_subscription_payment_for_settlement(p_reference text)
returns table (amount_minor bigint, currency text, status text)
language sql
security definer
stable
set search_path = public
as $$
  select sp.amount_minor, sp.currency, sp.status
  from public.subscription_payments sp
  where sp.paystack_reference = p_reference;
$$;

revoke execute on function public.get_subscription_payment_for_settlement(text) from public;
grant execute on function public.get_subscription_payment_for_settlement(text) to service_role;

-- THE settlement function. service_role ONLY — see the table comments in
-- 20260825100200/100300 for why granting this to anon/authenticated would
-- let anyone holding the public anon key grant themselves free service.
--
-- The PENDING -> SUCCESS transition is the idempotency guard: a replay
-- (duplicate webhook, or webhook racing the browser callback) finds zero
-- rows on the `where status = 'PENDING'` conditional update and extends
-- nothing — see subscription_payments' own comment for the full reasoning,
-- reused from Milestone 08's create_sale() shape.
--
-- `greatest(current_period_end, now())` is what makes an early renewal
-- STACK rather than truncate: renewing on day 20 of a 30-day period yields
-- 40 days remaining, not 30.
create or replace function public.apply_subscription_payment(
  p_reference text,
  p_transaction_id bigint,
  p_amount_minor bigint,
  p_currency text,
  p_verification jsonb
)
returns table (
  payment_id uuid,
  subscription_id uuid,
  organization_id uuid,
  extended boolean,
  new_period_end timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.subscription_payments;
  v_new_period_end timestamptz;
begin
  update public.subscription_payments
  set status = 'SUCCESS',
      paystack_transaction_id = p_transaction_id,
      verified_at = now(),
      verification_response = p_verification
  where paystack_reference = p_reference
    and status = 'PENDING'
  returning * into v_payment;

  if v_payment.id is null then
    -- Replay, or an unknown reference. Return the existing row (if any) with
    -- extended = false rather than raising — the caller (settlement.ts)
    -- reports this as outcome 'duplicate', not an error.
    select * into v_payment from public.subscription_payments where paystack_reference = p_reference;
    if v_payment.id is null then
      raise exception 'no subscription_payments row for reference %', p_reference;
    end if;
    return query
      select v_payment.id, v_payment.subscription_id, v_payment.organization_id, false,
             s.current_period_end
      from public.subscriptions s where s.id = v_payment.subscription_id;
    return;
  end if;

  update public.subscriptions
  set current_period_start = greatest(current_period_end, now()),
      current_period_end = greatest(current_period_end, now())
                            + public.billing_period_interval(v_payment.billing_period),
      billing_period = v_payment.billing_period,
      price_minor = v_payment.amount_minor,
      currency = v_payment.currency,
      status = 'ACTIVE',
      is_trial = false
  where id = v_payment.subscription_id
  returning current_period_end into v_new_period_end;

  perform public.record_audit_event(
    v_payment.organization_id, null, 'subscription.payment_verified', 'subscription_payment', v_payment.id,
    jsonb_build_object('paystack_reference', p_reference, 'amount_minor', p_amount_minor)
  );
  perform public.record_audit_event(
    v_payment.organization_id, null, 'subscription.renewed', 'subscriptions', v_payment.subscription_id,
    jsonb_build_object('new_period_end', v_new_period_end)
  );

  return query select v_payment.id, v_payment.subscription_id, v_payment.organization_id, true, v_new_period_end;
end;
$$;

revoke execute on function public.apply_subscription_payment(text, bigint, bigint, text, jsonb) from public;
grant execute on function public.apply_subscription_payment(text, bigint, bigint, text, jsonb) to service_role;

-- Marks a payment attempt as definitively failed (Paystack said not-
-- successful, or the amount/currency Paystack confirms doesn't match what
-- was expected). service_role only — same reasoning as apply_subscription_payment().
create or replace function public.fail_subscription_payment(
  p_reference text,
  p_reason text,
  p_verification jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.subscription_payments;
begin
  update public.subscription_payments
  set status = 'FAILED',
      failure_reason = p_reason,
      verification_response = coalesce(p_verification, verification_response)
  where paystack_reference = p_reference
    and status = 'PENDING'
  returning * into v_payment;

  if v_payment.id is null then
    return false;
  end if;

  perform public.record_audit_event(
    v_payment.organization_id, null, 'subscription.payment_verification_failed',
    'subscription_payment', v_payment.id,
    jsonb_build_object('paystack_reference', p_reference, 'reason', p_reason)
  );

  return true;
end;
$$;

revoke execute on function public.fail_subscription_payment(text, text, jsonb) from public;
grant execute on function public.fail_subscription_payment(text, text, jsonb) to service_role;

-- The cheap, second idempotency guard (see webhook_events' table comment,
-- 20260825100300). is_duplicate = true for any pre-existing row regardless
-- of its status — only a RECEIVED row is re-claimable, and the caller
-- (app/api/webhooks/paystack/route.ts) treats "duplicate" as "stop here"
-- either way, since a terminal row means this exact delivery already ran to
-- a conclusion.
create or replace function public.record_webhook_event(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_reference text,
  p_payload jsonb
)
returns table (event_row_id uuid, is_duplicate boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.webhook_events (provider, event_id, event_type, reference, payload)
  values (p_provider, p_event_id, p_event_type, p_reference, p_payload)
  on conflict (provider, event_id) do nothing
  returning id into v_id;

  if v_id is not null then
    return query select v_id, false;
    return;
  end if;

  select id into v_id from public.webhook_events where provider = p_provider and event_id = p_event_id;
  update public.webhook_events set attempts = attempts + 1 where id = v_id;
  return query select v_id, true;
end;
$$;

revoke execute on function public.record_webhook_event(text, text, text, text, jsonb) from public;
grant execute on function public.record_webhook_event(text, text, text, text, jsonb) to service_role;

create or replace function public.mark_webhook_event(
  p_id uuid,
  p_status text,
  p_error text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.webhook_events
  set status = p_status, error = p_error, processed_at = now()
  where id = p_id;
$$;

revoke execute on function public.mark_webhook_event(uuid, text, text) from public;
grant execute on function public.mark_webhook_event(uuid, text, text) to service_role;
