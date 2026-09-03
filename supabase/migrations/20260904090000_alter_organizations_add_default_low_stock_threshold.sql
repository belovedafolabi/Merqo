-- An organization-wide default low-stock threshold, and the fold of it into
-- the low-stock alert path.
--
-- =============================================================================
-- WHY THIS EXISTS
-- =============================================================================
-- Low-stock detection has been fully gated on inventory_balances.low_stock_
-- threshold since Milestone 07: a per-(branch, product, variant) column, NULL
-- by default, settable only one balance row at a time through
-- components/inventory/low-stock-threshold-dialog.tsx. On a real deployment
-- nobody sets 500 of them by hand, so every threshold stays NULL, `notify_low_
-- stock()` finds nothing at or below NULL, and the dashboard's Low-stock
-- widget is permanently empty — the feature reads as broken because in
-- practice it never has any data to act on.
--
-- This adds one number an Owner sets once in Settings -> Organization that
-- applies to every balance without its own explicit threshold. The per-row
-- override is unchanged and still wins where set; a row is "low" against
-- coalesce(its own threshold, the org default), and only when that coalesced
-- value is non-NULL (an org that sets no default keeps today's behaviour
-- exactly).
--
-- No new RLS policy or grant: organizations_select / organizations_update
-- (20260822093700) already gate every column on this table and `authenticated`
-- already holds SELECT/UPDATE on it — a new column inherits both. The write is
-- permission-gated in lib/organization/mutations.ts on `organizations.update`,
-- the same key the rest of that screen uses.

alter table public.organizations
  add column default_low_stock_threshold numeric(14, 3)
    constraint organizations_default_low_stock_threshold_check
    check (default_low_stock_threshold is null or default_low_stock_threshold >= 0);

comment on column public.organizations.default_low_stock_threshold is
  'Fallback low-stock threshold applied to every inventory_balances row that '
  'has no low_stock_threshold of its own. NULL = no organization-wide default '
  '(only rows with an explicit per-row threshold are ever flagged low).';

-- ---------------------------------------------------------------------------
-- notify_low_stock — re-evaluate against the effective threshold.
--
-- Identical to 20260824100400's definition except the `candidates` CTE now
-- resolves `coalesce(ib.low_stock_threshold, o.default_low_stock_threshold)`
-- as `v_threshold` and filters/reports on that. Signature is unchanged, so
-- the existing EXECUTE grants carry over untouched. Everything else — the
-- branch-access guard, the inventory.adjust recipient resolution, the
-- state-based (not crossing-based) model, the dedupe key — is verbatim from
-- that migration; see its header for the reasoning behind each.
create or replace function public.notify_low_stock(
  p_branch_id uuid,
  p_product_ids uuid[]
)
returns table (
  notification_id uuid,
  user_id uuid,
  email text,
  full_name text,
  email_enabled boolean,
  product_name text,
  sku text,
  branch_name text,
  quantity numeric,
  threshold numeric,
  href text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_branch_name text;
  v_default_threshold numeric;
begin
  select b.organization_id, b.name, o.default_low_stock_threshold
    into v_organization_id, v_branch_name, v_default_threshold
  from public.branches b
  join public.organizations o on o.id = b.organization_id
  where b.id = p_branch_id;

  if v_organization_id is null then
    raise exception 'branch % not found', p_branch_id using errcode = '02000';
  end if;

  if not public.user_has_branch_access(p_branch_id, v_organization_id) then
    raise exception 'not authorized for branch %', p_branch_id using errcode = '42501';
  end if;

  return query
  with candidates as (
    select
      ib.id as balance_id,
      ib.available_quantity,
      coalesce(ib.low_stock_threshold, v_default_threshold) as effective_threshold,
      p.name as product_name,
      p.sku as sku
    from public.inventory_balances ib
    join public.products p on p.id = ib.product_id
    where ib.branch_id = p_branch_id
      and coalesce(ib.low_stock_threshold, v_default_threshold) is not null
      and ib.available_quantity <= coalesce(ib.low_stock_threshold, v_default_threshold)
      and (p_product_ids is null or ib.product_id = any(p_product_ids))
  ),
  recipients as (
    select r.* from public.resolve_notification_recipients(
      'inventory.adjust', v_organization_id, p_branch_id, 'inventory'
    ) r
    where r.in_app_enabled
  ),
  inserted as (
    select
      public.create_user_notification(
        rec.user_id,
        v_organization_id,
        'inventory',
        'inventory.low_stock',
        c.product_name || ' is low on stock',
        c.product_name || ' at ' || v_branch_name || ' has ' || c.available_quantity ||
          ' available, at or below its threshold of ' || c.effective_threshold || '.',
        '/inventory?branchId=' || p_branch_id,
        jsonb_build_object(
          'balanceId', c.balance_id,
          'branchId', p_branch_id,
          'quantity', c.available_quantity,
          'threshold', c.effective_threshold
        ),
        'inventory.low_stock:' || c.balance_id
      ) as id,
      rec.user_id,
      rec.email,
      rec.full_name,
      rec.email_enabled,
      c.product_name,
      c.sku,
      c.available_quantity,
      c.effective_threshold
    from candidates c
    cross join recipients rec
  )
  select
    i.id,
    i.user_id,
    i.email,
    i.full_name,
    i.email_enabled,
    i.product_name,
    i.sku,
    v_branch_name,
    i.available_quantity,
    i.effective_threshold,
    '/inventory?branchId=' || p_branch_id
  from inserted i
  where i.id is not null;
end;
$$;
