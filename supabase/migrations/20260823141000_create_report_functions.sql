-- Milestone 10's standard report catalog, as aggregate functions.
--
-- =============================================================================
-- WHY THESE ARE `SECURITY INVOKER` WHEN EVERY OTHER FUNCTION HERE IS DEFINER
-- =============================================================================
-- Read this before "fixing" the modifier to match the surrounding files. It is
-- deliberate, and it is the inverse of the write functions for the inverse
-- reason.
--
-- 20260823120800_create_sales_functions.sql's header explains why writes are
-- SECURITY DEFINER: they insert into append-only tables (`sales`, `payments`,
-- `inventory_movements`) that no application role holds an INSERT grant on,
-- and the app layer's requirePermission() is the authorization gate. Bypassing
-- RLS is the entire point there.
--
-- Reads have the opposite requirement. Milestone 10's Security Requirements
-- say every report must be "scoped by the requesting user's
-- organization/branch/business-unit permissions", and Milestones 03–09 already
-- built and tested exactly that boundary as RLS policies. SECURITY INVOKER
-- means these functions inherit it for free: `report_sales_by_scope` running as
-- a Branch-A-scoped manager physically cannot read Branch B's rows, because
-- sales_select rejects them — not because a WHERE clause here remembered to
-- filter. A DEFINER read function would silently discard that whole boundary
-- and make each of the 13 functions below individually responsible for
-- re-implementing it correctly. One missed predicate would be a cross-branch
-- data leak, which this milestone's Risks section names as the specific danger
-- to design against.
--
-- Note that RLS is necessary but NOT sufficient: `sales_select` gates on branch
-- access alone, so any org member can read their own branch's sales. The
-- `reports.view` / `reports.view_financials` / `reports.export` checks in
-- lib/reports/queries.ts are what decide whether a user may run a report at
-- all. RLS decides which rows a permitted report returns.
--
-- =============================================================================
-- WHY AGGREGATION HAPPENS HERE AND NOT IN TYPESCRIPT
-- =============================================================================
-- supabase/config.toml sets `max_rows = 1000`. Fetching raw `sale_items` rows
-- through PostgREST to sum them in application code would, for any branch with
-- more than 1000 line items in the period, return a *silently truncated*
-- response with no error — producing a quietly wrong revenue or COGS figure
-- that a small seeded test would never catch. Grouping in SQL returns one row
-- per group, structurally under the cap. Every function below also applies
-- `least(coalesce(p_limit, 500), 1000)` so even a pathological grouping stays
-- inside it, and reports the truncation honestly rather than hiding it.
--
-- =============================================================================
-- WHY NO VIEWS
-- =============================================================================
-- Milestone 10's Database Changes permit "SQL views for genuinely repeated
-- complex joins". None are added, for a security reason worth recording: a
-- Postgres view declared without `with (security_invoker = on)` executes with
-- its *owner's* privileges, and `postgres` owns every object in this schema —
-- so a reporting view written the obvious way would bypass RLS entirely and
-- leak across branches. Every join a view would have encapsulated already lives
-- inside exactly one function below, so a view would buy no deduplication while
-- adding that footgun.
--
-- =============================================================================
-- SHAPE
-- =============================================================================
-- Thirteen functions cover docs/PRD.md §28's full catalog, rather than one
-- function per bullet: "sales by date / branch / business unit / employee" are
-- the same query with a different GROUP BY, and writing them out four times
-- would be four places for the money arithmetic to drift apart. Grouping is a
-- parameter, validated against an explicit whitelist at the top of each
-- function — the same discipline run_custom_report() (20260823141100) applies,
-- and the reason `language plpgsql` is used throughout instead of the terser
-- `language sql`: only plpgsql can `raise` on an unrecognised grouping rather
-- than silently returning one null-keyed bucket.
--
-- Every function takes the same scope/period parameters:
--   p_organization_id  — always required
--   p_branch_id        — null means "every branch the caller can see" (RLS decides)
--   p_business_unit_id — null means "every business unit"; see the note below
--   p_from / p_to      — half-open [from, to); null on either side is unbounded
--
-- The explicit p_business_unit_id filter exists because of a real gap:
-- user_has_branch_access() (20260822093300) checks only user_roles.branch_id
-- and never user_roles.business_unit_id, so a BU-scoped user currently sees
-- their whole *branch's* sales through RLS. Retrofitting that policy is a
-- change to Milestone 08's security model and does not belong in a reporting
-- milestone; these functions filter explicitly instead, and the underlying gap
-- is tracked as a follow-up for Milestone 15's security hardening.
--
-- MONEY SEMANTICS, per lib/sales/calculations.ts's locked order
-- (subtotal -> discount -> tax -> service charge -> total):
--   sales.subtotal        = Σ sale_items.line_total, i.e. ALREADY net of
--                           per-line discounts, but BEFORE the order-level one
--   net sales / revenue   = subtotal − discount_amount  (≡ total − tax − service charge)
--   tax & service charge  = collected on behalf of others, NEVER revenue
--                           (docs/Financial_Architecture_Accounting_Reconciliation.md §29–30)
-- Functions that aggregate `sales` alone therefore report `gross_sales` as
-- `subtotal`; per-line discounts are surfaced by report_sales_by_item and
-- report_discounts, which join sale_items and can see them.

-- =============================================================================
-- 1. SALES
-- =============================================================================

-- docs/PRD.md §28's "sales by date / branch / business unit / employee", plus
-- week/month rollups. Aggregates the `sales` table alone — no join to
-- sale_items — so it stays a single index-driven scan.
create or replace function public.report_sales_by_scope(
  p_organization_id uuid,
  p_branch_id uuid default null,
  p_business_unit_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_group_by text default 'day',
  p_limit int default 500
)
returns table (
  group_key text,
  group_label text,
  sale_count bigint,
  gross_sales numeric,
  discount_amount numeric,
  net_sales numeric,
  tax_amount numeric,
  service_charge_amount numeric,
  total numeric
)
language plpgsql
security invoker
stable
set search_path = public
as $$
begin
  if p_group_by not in ('day', 'week', 'month', 'branch', 'business_unit', 'employee') then
    raise exception 'unsupported sales grouping %', p_group_by using errcode = 'P0004';
  end if;

  return query
  select
    g.key,
    g.label,
    count(*)::bigint,
    sum(s.subtotal),
    sum(s.discount_amount),
    sum(s.subtotal - s.discount_amount),
    sum(s.tax_amount),
    sum(s.service_charge_amount),
    sum(s.total)
  from public.sales s
  -- LEFT JOINs throughout: a label row hidden by its own RLS policy must
  -- degrade to an unnamed group, never silently drop the sale from the totals.
  left join public.branches b on b.id = s.branch_id
  left join public.business_units bu on bu.id = s.business_unit_id
  left join public.users u on u.id = s.created_by
  cross join lateral (
    select
      case p_group_by
        when 'day' then to_char(date_trunc('day', s.created_at), 'YYYY-MM-DD')
        when 'week' then to_char(date_trunc('week', s.created_at), 'YYYY-MM-DD')
        when 'month' then to_char(date_trunc('month', s.created_at), 'YYYY-MM')
        when 'branch' then s.branch_id::text
        when 'business_unit' then s.business_unit_id::text
        else coalesce(s.created_by::text, 'unassigned')
      end as key,
      case p_group_by
        when 'day' then to_char(date_trunc('day', s.created_at), 'YYYY-MM-DD')
        when 'week' then 'Week of ' || to_char(date_trunc('week', s.created_at), 'YYYY-MM-DD')
        when 'month' then to_char(date_trunc('month', s.created_at), 'YYYY-MM')
        when 'branch' then coalesce(b.name, 'Unknown branch')
        when 'business_unit' then coalesce(bu.name, 'Unknown business unit')
        else coalesce(u.full_name, 'Unassigned')
      end as label
  ) g
  where s.organization_id = p_organization_id
    and (p_branch_id is null or s.branch_id = p_branch_id)
    and (p_business_unit_id is null or s.business_unit_id = p_business_unit_id)
    and (p_from is null or s.created_at >= p_from)
    and (p_to is null or s.created_at < p_to)
  group by g.key, g.label
  order by g.key
  limit least(coalesce(p_limit, 500), 1000);
end;
$$;

-- docs/PRD.md §28's "sales by product / category". Joins sale_items, so this is
-- the one sales report that can see per-line discounts and unit cost — hence
-- the cogs/gross_profit columns the scope report above cannot produce.
create or replace function public.report_sales_by_item(
  p_organization_id uuid,
  p_branch_id uuid default null,
  p_business_unit_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_group_by text default 'product',
  p_limit int default 500
)
returns table (
  group_key text,
  group_label text,
  quantity_sold numeric,
  gross_sales numeric,
  line_discount numeric,
  net_sales numeric,
  cogs numeric,
  gross_profit numeric
)
language plpgsql
security invoker
stable
set search_path = public
as $$
begin
  if p_group_by not in ('product', 'category', 'variant') then
    raise exception 'unsupported sales item grouping %', p_group_by using errcode = 'P0004';
  end if;

  return query
  select
    g.key,
    g.label,
    sum(si.quantity),
    sum(si.line_total + si.line_discount),
    sum(si.line_discount),
    sum(si.line_total),
    sum(si.quantity * si.unit_cost),
    sum(si.line_total - (si.quantity * si.unit_cost))
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  left join public.products p on p.id = si.product_id
  left join public.product_variants pv on pv.id = si.variant_id
  left join public.categories c on c.id = p.category_id
  cross join lateral (
    select
      case p_group_by
        when 'product' then si.product_id::text
        when 'variant' then coalesce(si.variant_id::text, si.product_id::text)
        -- Products with no category collapse into one explicit bucket rather
        -- than a null key that would sort and export unpredictably.
        else coalesce(p.category_id::text, 'uncategorised')
      end as key,
      case p_group_by
        when 'product' then coalesce(p.name, 'Unknown product')
        when 'variant' then coalesce(p.name, 'Unknown product')
          || coalesce(' — ' || pv.name, '')
        else coalesce(c.name, 'Uncategorised')
      end as label
  ) g
  where s.organization_id = p_organization_id
    and (p_branch_id is null or s.branch_id = p_branch_id)
    and (p_business_unit_id is null or s.business_unit_id = p_business_unit_id)
    and (p_from is null or s.created_at >= p_from)
    and (p_to is null or s.created_at < p_to)
  group by g.key, g.label
  order by sum(si.line_total) desc
  limit least(coalesce(p_limit, 500), 1000);
end;
$$;

-- docs/PRD.md §28's "sales by payment method". Aggregates `payments`, not
-- `sales`: a sale has exactly one payment today (Milestone 08 excludes split
-- payments), but attributing money by the row that actually recorded it keeps
-- this report correct if that ever changes.
create or replace function public.report_sales_by_payment_method(
  p_organization_id uuid,
  p_branch_id uuid default null,
  p_business_unit_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit int default 500
)
returns table (
  group_key text,
  group_label text,
  payment_count bigint,
  amount numeric
)
language plpgsql
security invoker
stable
set search_path = public
as $$
begin
  return query
  select
    pay.method,
    initcap(replace(pay.method, '_', ' ')),
    count(*)::bigint,
    sum(pay.amount)
  from public.payments pay
  join public.sales s on s.id = pay.sale_id
  where s.organization_id = p_organization_id
    and (p_branch_id is null or s.branch_id = p_branch_id)
    and (p_business_unit_id is null or s.business_unit_id = p_business_unit_id)
    and (p_from is null or pay.created_at >= p_from)
    and (p_to is null or pay.created_at < p_to)
  group by pay.method
  order by sum(pay.amount) desc
  limit least(coalesce(p_limit, 500), 1000);
end;
$$;

-- =============================================================================
-- 2. FINANCIAL
-- =============================================================================

-- The single raw-aggregate row that feeds the whole accounting summary.
--
-- Note carefully what this does and does not do: it SUMS, and it does not
-- DERIVE. Net sales, gross profit and net profit are not columns here even
-- though every input to them is — those subtractions live in
-- lib/reports/accounting.ts, pure and unit-tested against
-- docs/Financial_Architecture_Accounting_Reconciliation.md §31–34's own worked
-- examples. Splitting it this way means the arithmetic that defines profit has
-- exactly one implementation, in the language where it can be tested without a
-- database, while the summation that must happen in Postgres (see the max_rows
-- note in this file's header) happens in Postgres. Adding a `gross_profit`
-- column here would create a second, untested copy of that rule.
--
-- Returns are attributed to the period in which the return happened, not the
-- period of the original sale: a January sale returned in February reduces
-- February's COGS. Refunds likewise. This is what makes each period's report
-- stable once closed.
create or replace function public.report_accounting_aggregates(
  p_organization_id uuid,
  p_branch_id uuid default null,
  p_business_unit_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  sale_count bigint,
  gross_sales numeric,
  line_discounts numeric,
  order_discounts numeric,
  tax_collected numeric,
  service_charge_collected numeric,
  sale_cogs numeric,
  return_cogs numeric,
  refunds_approved numeric,
  refund_count bigint,
  expenses_approved numeric,
  expense_count bigint
)
language plpgsql
security invoker
stable
set search_path = public
as $$
begin
  return query
  select
    coalesce(sales_agg.sale_count, 0)::bigint,
    coalesce(sales_agg.gross_sales, 0),
    coalesce(sales_agg.line_discounts, 0),
    coalesce(sales_agg.order_discounts, 0),
    coalesce(sales_agg.tax_collected, 0),
    coalesce(sales_agg.service_charge_collected, 0),
    coalesce(sales_agg.sale_cogs, 0),
    coalesce(returns_agg.return_cogs, 0),
    coalesce(refunds_agg.refunds_approved, 0),
    coalesce(refunds_agg.refund_count, 0)::bigint,
    coalesce(expenses_agg.expenses_approved, 0),
    coalesce(expenses_agg.expense_count, 0)::bigint
  from
    (
      -- Sale-level money and item-level money in one pass. The item sums are
      -- computed in a subquery keyed by sale so the sale-level columns
      -- (discount, tax, total) are not multiplied by the line count — the
      -- classic fan-out error when joining a header to its lines.
      select
        count(*)::bigint as sale_count,
        sum(s.subtotal) as gross_sales,
        sum(coalesce(items.line_discount, 0)) as line_discounts,
        sum(s.discount_amount) as order_discounts,
        sum(s.tax_amount) as tax_collected,
        sum(s.service_charge_amount) as service_charge_collected,
        sum(coalesce(items.cogs, 0)) as sale_cogs
      from public.sales s
      left join lateral (
        select
          sum(si.line_discount) as line_discount,
          sum(si.quantity * si.unit_cost) as cogs
        from public.sale_items si
        where si.sale_id = s.id
      ) items on true
      where s.organization_id = p_organization_id
        and (p_branch_id is null or s.branch_id = p_branch_id)
        and (p_business_unit_id is null or s.business_unit_id = p_business_unit_id)
        and (p_from is null or s.created_at >= p_from)
        and (p_to is null or s.created_at < p_to)
    ) sales_agg
  cross join
    (
      select sum(ri.quantity * si.unit_cost) as return_cogs
      from public.return_items ri
      join public.returns r on r.id = ri.return_id
      join public.sale_items si on si.id = ri.sale_item_id
      join public.sales s on s.id = si.sale_id
      where r.organization_id = p_organization_id
        and (p_branch_id is null or r.branch_id = p_branch_id)
        and (p_business_unit_id is null or s.business_unit_id = p_business_unit_id)
        and (p_from is null or r.created_at >= p_from)
        and (p_to is null or r.created_at < p_to)
    ) returns_agg
  cross join
    (
      -- Approved only. A pending refund is a request, not money that has left
      -- the business (Milestone 08's two-actor refund flow), and counting it
      -- would understate profit for anything a manager later rejects.
      select
        sum(rf.amount) as refunds_approved,
        count(*) as refund_count
      from public.refunds rf
      join public.sales s on s.id = rf.sale_id
      where rf.organization_id = p_organization_id
        and rf.status = 'approved'
        and (p_branch_id is null or rf.branch_id = p_branch_id)
        and (p_business_unit_id is null or s.business_unit_id = p_business_unit_id)
        and (p_from is null or rf.created_at >= p_from)
        and (p_to is null or rf.created_at < p_to)
    ) refunds_agg
  cross join
    (
      -- Approved and not voided, for the same reason: an unapproved expense is
      -- a claim, and a voided one has been formally withdrawn.
      select
        sum(e.amount) as expenses_approved,
        count(*) as expense_count
      from public.expenses e
      where e.organization_id = p_organization_id
        and e.status = 'approved'
        and e.voided_at is null
        and (p_branch_id is null or e.branch_id = p_branch_id)
        and (p_business_unit_id is null or e.business_unit_id = p_business_unit_id)
        and (p_from is null or e.expense_date >= p_from::date)
        and (p_to is null or e.expense_date < p_to::date)
    ) expenses_agg;
end;
$$;

-- docs/PRD.md §28's "refunds" financial report.
create or replace function public.report_refunds(
  p_organization_id uuid,
  p_branch_id uuid default null,
  p_business_unit_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_group_by text default 'day',
  p_limit int default 500
)
returns table (
  group_key text,
  group_label text,
  refund_count bigint,
  approved_amount numeric,
  pending_amount numeric,
  rejected_amount numeric
)
language plpgsql
security invoker
stable
set search_path = public
as $$
begin
  if p_group_by not in ('day', 'month', 'branch', 'method', 'reason') then
    raise exception 'unsupported refund grouping %', p_group_by using errcode = 'P0004';
  end if;

  return query
  select
    g.key,
    g.label,
    count(*)::bigint,
    -- filter clauses rather than three passes: one scan, three totals, and the
    -- status split stays visible in the report instead of collapsing into a
    -- single number whose composition nobody can see.
    coalesce(sum(rf.amount) filter (where rf.status = 'approved'), 0),
    coalesce(sum(rf.amount) filter (where rf.status = 'pending'), 0),
    coalesce(sum(rf.amount) filter (where rf.status = 'rejected'), 0)
  from public.refunds rf
  join public.sales s on s.id = rf.sale_id
  left join public.branches b on b.id = rf.branch_id
  cross join lateral (
    select
      case p_group_by
        when 'day' then to_char(date_trunc('day', rf.created_at), 'YYYY-MM-DD')
        when 'month' then to_char(date_trunc('month', rf.created_at), 'YYYY-MM')
        when 'branch' then rf.branch_id::text
        when 'method' then rf.method
        else rf.reason
      end as key,
      case p_group_by
        when 'day' then to_char(date_trunc('day', rf.created_at), 'YYYY-MM-DD')
        when 'month' then to_char(date_trunc('month', rf.created_at), 'YYYY-MM')
        when 'branch' then coalesce(b.name, 'Unknown branch')
        when 'method' then initcap(replace(rf.method, '_', ' '))
        else rf.reason
      end as label
  ) g
  where rf.organization_id = p_organization_id
    and (p_branch_id is null or rf.branch_id = p_branch_id)
    and (p_business_unit_id is null or s.business_unit_id = p_business_unit_id)
    and (p_from is null or rf.created_at >= p_from)
    and (p_to is null or rf.created_at < p_to)
  group by g.key, g.label
  order by g.key
  limit least(coalesce(p_limit, 500), 1000);
end;
$$;

-- docs/PRD.md §28's "discounts" financial report. Reports both discount layers
-- separately — an order-level discount is a deliberate managerial act with a
-- reason attached, while line discounts are till-level price adjustments;
-- summing them into one number would hide which is which.
create or replace function public.report_discounts(
  p_organization_id uuid,
  p_branch_id uuid default null,
  p_business_unit_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_group_by text default 'day',
  p_limit int default 500
)
returns table (
  group_key text,
  group_label text,
  discounted_sale_count bigint,
  order_discount numeric,
  line_discount numeric,
  total_discount numeric,
  gross_sales numeric
)
language plpgsql
security invoker
stable
set search_path = public
as $$
begin
  if p_group_by not in ('day', 'month', 'branch', 'employee', 'reason') then
    raise exception 'unsupported discount grouping %', p_group_by using errcode = 'P0004';
  end if;

  return query
  select
    g.key,
    g.label,
    count(*)::bigint,
    sum(s.discount_amount),
    sum(coalesce(items.line_discount, 0)),
    sum(s.discount_amount + coalesce(items.line_discount, 0)),
    sum(s.subtotal)
  from public.sales s
  left join lateral (
    select sum(si.line_discount) as line_discount
    from public.sale_items si
    where si.sale_id = s.id
  ) items on true
  left join public.branches b on b.id = s.branch_id
  left join public.users u on u.id = s.created_by
  cross join lateral (
    select
      case p_group_by
        when 'day' then to_char(date_trunc('day', s.created_at), 'YYYY-MM-DD')
        when 'month' then to_char(date_trunc('month', s.created_at), 'YYYY-MM')
        when 'branch' then s.branch_id::text
        when 'employee' then coalesce(s.created_by::text, 'unassigned')
        else coalesce(s.discount_reason, 'No reason given')
      end as key,
      case p_group_by
        when 'day' then to_char(date_trunc('day', s.created_at), 'YYYY-MM-DD')
        when 'month' then to_char(date_trunc('month', s.created_at), 'YYYY-MM')
        when 'branch' then coalesce(b.name, 'Unknown branch')
        when 'employee' then coalesce(u.full_name, 'Unassigned')
        else coalesce(s.discount_reason, 'No reason given')
      end as label
  ) g
  where s.organization_id = p_organization_id
    and (p_branch_id is null or s.branch_id = p_branch_id)
    and (p_business_unit_id is null or s.business_unit_id = p_business_unit_id)
    and (p_from is null or s.created_at >= p_from)
    and (p_to is null or s.created_at < p_to)
    -- Only sales that actually carry a discount: a "discount report" listing
    -- every undiscounted sale as a zero row is noise, and the gross_sales
    -- column stays meaningful as "value that was discounted against".
    and (s.discount_amount > 0 or coalesce(items.line_discount, 0) > 0)
  group by g.key, g.label
  order by sum(s.discount_amount + coalesce(items.line_discount, 0)) desc
  limit least(coalesce(p_limit, 500), 1000);
end;
$$;

-- docs/PRD.md §28's "expenses" financial report.
create or replace function public.report_expenses(
  p_organization_id uuid,
  p_branch_id uuid default null,
  p_business_unit_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_group_by text default 'category',
  p_limit int default 500
)
returns table (
  group_key text,
  group_label text,
  expense_count bigint,
  approved_amount numeric,
  pending_amount numeric,
  rejected_amount numeric,
  voided_amount numeric
)
language plpgsql
security invoker
stable
set search_path = public
as $$
begin
  if p_group_by not in ('day', 'month', 'category', 'branch', 'payment_method', 'status') then
    raise exception 'unsupported expense grouping %', p_group_by using errcode = 'P0004';
  end if;

  return query
  select
    g.key,
    g.label,
    count(*)::bigint,
    coalesce(sum(e.amount) filter (where e.status = 'approved' and e.voided_at is null), 0),
    coalesce(sum(e.amount) filter (where e.status = 'pending' and e.voided_at is null), 0),
    coalesce(sum(e.amount) filter (where e.status = 'rejected' and e.voided_at is null), 0),
    coalesce(sum(e.amount) filter (where e.voided_at is not null), 0)
  from public.expenses e
  left join public.branches b on b.id = e.branch_id
  cross join lateral (
    select
      case p_group_by
        when 'day' then to_char(e.expense_date, 'YYYY-MM-DD')
        when 'month' then to_char(e.expense_date, 'YYYY-MM')
        when 'category' then e.category
        when 'branch' then e.branch_id::text
        when 'payment_method' then e.payment_method
        else e.status
      end as key,
      case p_group_by
        when 'day' then to_char(e.expense_date, 'YYYY-MM-DD')
        when 'month' then to_char(e.expense_date, 'YYYY-MM')
        when 'category' then e.category
        when 'branch' then coalesce(b.name, 'Unknown branch')
        when 'payment_method' then initcap(replace(e.payment_method, '_', ' '))
        else initcap(e.status)
      end as label
  ) g
  where e.organization_id = p_organization_id
    and (p_branch_id is null or e.branch_id = p_branch_id)
    and (p_business_unit_id is null or e.business_unit_id = p_business_unit_id)
    and (p_from is null or e.expense_date >= p_from::date)
    and (p_to is null or e.expense_date < p_to::date)
  group by g.key, g.label
  order by g.key
  limit least(coalesce(p_limit, 500), 1000);
end;
$$;

-- =============================================================================
-- 3. INVENTORY
-- =============================================================================

-- docs/PRD.md §28's "current stock", "low stock" and "valuation" in one
-- function: all three are the same per-product balance row, differing only in
-- whether low-stock rows are filtered and whether the reader looks at the
-- valuation column. Valuation uses live cost price, correctly — unlike COGS,
-- this is a statement about what stock is worth *now*, not what a past
-- transaction cost.
create or replace function public.report_inventory_stock(
  p_organization_id uuid,
  p_branch_id uuid default null,
  p_business_unit_id uuid default null,
  p_low_stock_only boolean default false,
  p_limit int default 500
)
returns table (
  branch_id uuid,
  branch_name text,
  product_id uuid,
  product_name text,
  variant_name text,
  sku text,
  quantity numeric,
  reserved_quantity numeric,
  available_quantity numeric,
  low_stock_threshold numeric,
  cost_price numeric,
  valuation numeric
)
language plpgsql
security invoker
stable
set search_path = public
as $$
begin
  return query
  select
    ib.branch_id,
    coalesce(b.name, 'Unknown branch'),
    ib.product_id,
    coalesce(p.name, 'Unknown product'),
    pv.name,
    coalesce(pv.sku, p.sku),
    ib.quantity,
    ib.reserved_quantity,
    ib.available_quantity,
    ib.low_stock_threshold,
    coalesce(pv.cost_price, p.cost_price, 0),
    ib.quantity * coalesce(pv.cost_price, p.cost_price, 0)
  from public.inventory_balances ib
  join public.branches b on b.id = ib.branch_id
  left join public.products p on p.id = ib.product_id
  left join public.product_variants pv on pv.id = ib.variant_id
  where b.organization_id = p_organization_id
    and (p_branch_id is null or ib.branch_id = p_branch_id)
    and (p_business_unit_id is null or ib.business_unit_id = p_business_unit_id)
    -- A null threshold means "no threshold set", which is never low stock —
    -- treating it as 0 would be the same answer, but treating it as "always
    -- low" is the tempting mistake this predicate rules out explicitly.
    and (
      not p_low_stock_only
      or (ib.low_stock_threshold is not null and ib.available_quantity <= ib.low_stock_threshold)
    )
  order by coalesce(p.name, ''), pv.name nulls first
  limit least(coalesce(p_limit, 500), 1000);
end;
$$;

-- docs/PRD.md §28's "stock movement".
create or replace function public.report_inventory_movements(
  p_organization_id uuid,
  p_branch_id uuid default null,
  p_business_unit_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit int default 500
)
returns table (
  movement_id uuid,
  occurred_at timestamptz,
  branch_name text,
  product_name text,
  variant_name text,
  movement_type text,
  quantity_delta numeric,
  quantity_after numeric,
  reason text,
  performed_by text
)
language plpgsql
security invoker
stable
set search_path = public
as $$
begin
  return query
  select
    im.id,
    im.created_at,
    coalesce(b.name, 'Unknown branch'),
    coalesce(p.name, 'Unknown product'),
    pv.name,
    im.movement_type,
    im.quantity_delta,
    im.quantity_after,
    im.reason,
    coalesce(u.full_name, 'System')
  from public.inventory_movements im
  join public.branches b on b.id = im.branch_id
  left join public.products p on p.id = im.product_id
  left join public.product_variants pv on pv.id = im.variant_id
  left join public.users u on u.id = im.created_by
  where b.organization_id = p_organization_id
    and (p_branch_id is null or im.branch_id = p_branch_id)
    and (p_business_unit_id is null or im.business_unit_id = p_business_unit_id)
    and (p_from is null or im.created_at >= p_from)
    and (p_to is null or im.created_at < p_to)
  order by im.created_at desc
  limit least(coalesce(p_limit, 500), 1000);
end;
$$;

-- docs/PRD.md §28's "expiry". `p_days_ahead` is a window, not a cutoff date, so
-- the report answers the question operators actually ask ("what expires in the
-- next 30 days"). Already-expired batches with stock remaining are included —
-- they are the most urgent rows, and excluding them would hide the problem.
create or replace function public.report_expiry(
  p_organization_id uuid,
  p_branch_id uuid default null,
  p_days_ahead int default 30,
  p_limit int default 500
)
returns table (
  batch_id uuid,
  branch_name text,
  product_name text,
  variant_name text,
  batch_number text,
  expiry_date date,
  days_remaining int,
  quantity numeric
)
language plpgsql
security invoker
stable
set search_path = public
as $$
begin
  return query
  select
    bt.id,
    coalesce(b.name, 'Unknown branch'),
    coalesce(p.name, 'Unknown product'),
    pv.name,
    bt.batch_number,
    bt.expiry_date,
    (bt.expiry_date - current_date)::int,
    bt.quantity
  from public.batches bt
  join public.branches b on b.id = bt.branch_id
  left join public.products p on p.id = bt.product_id
  left join public.product_variants pv on pv.id = bt.variant_id
  where b.organization_id = p_organization_id
    and (p_branch_id is null or bt.branch_id = p_branch_id)
    and bt.expiry_date is not null
    and bt.quantity > 0
    and bt.expiry_date < current_date + coalesce(p_days_ahead, 30)
  order by bt.expiry_date
  limit least(coalesce(p_limit, 500), 1000);
end;
$$;

-- =============================================================================
-- 4. CUSTOMER
-- =============================================================================

-- docs/PRD.md §28's "customer transactions".
create or replace function public.report_customer_transactions(
  p_organization_id uuid,
  p_branch_id uuid default null,
  p_business_unit_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit int default 500
)
returns table (
  customer_id uuid,
  customer_code text,
  customer_name text,
  sale_count bigint,
  total_spent numeric,
  average_sale numeric,
  first_purchase_at timestamptz,
  last_purchase_at timestamptz
)
language plpgsql
security invoker
stable
set search_path = public
as $$
begin
  return query
  select
    c.id,
    c.customer_code,
    c.name,
    count(s.id)::bigint,
    coalesce(sum(s.total), 0),
    -- round to money precision here rather than leaving avg()'s full scale to
    -- surprise the exporter with a 20-decimal figure
    round(coalesce(avg(s.total), 0), 2),
    min(s.created_at),
    max(s.created_at)
  from public.customers c
  join public.sales s on s.customer_id = c.id
  where c.organization_id = p_organization_id
    and c.archived_at is null
    and (p_branch_id is null or s.branch_id = p_branch_id)
    and (p_business_unit_id is null or s.business_unit_id = p_business_unit_id)
    and (p_from is null or s.created_at >= p_from)
    and (p_to is null or s.created_at < p_to)
  group by c.id, c.customer_code, c.name
  order by coalesce(sum(s.total), 0) desc
  limit least(coalesce(p_limit, 500), 1000);
end;
$$;

-- docs/PRD.md §28's "store credit" customer report, and the store-credit half
-- of §27's accounting liabilities. `balance` is read from the account (the
-- cached, function-maintained value) while issued/spent are summed from the
-- ledger — showing both is what makes the report able to expose a discrepancy
-- rather than hide one behind a single number.
create or replace function public.report_store_credit(
  p_organization_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit int default 500
)
returns table (
  customer_id uuid,
  customer_code text,
  customer_name text,
  balance numeric,
  issued numeric,
  spent numeric,
  adjusted numeric,
  entry_count bigint
)
language plpgsql
security invoker
stable
set search_path = public
as $$
begin
  return query
  select
    c.id,
    c.customer_code,
    c.name,
    sca.balance,
    coalesce(sum(scl.amount) filter (where scl.entry_type in ('issue', 'refund_to_credit')), 0),
    -- 'spend' entries are stored negative (store_credit_ledger's sign
    -- constraint); negated here so the column reads as a positive "amount spent"
    coalesce(-sum(scl.amount) filter (where scl.entry_type = 'spend'), 0),
    coalesce(sum(scl.amount) filter (where scl.entry_type = 'adjustment'), 0),
    count(scl.id)::bigint
  from public.store_credit_accounts sca
  join public.customers c on c.id = sca.customer_id
  left join public.store_credit_ledger scl
    on scl.account_id = sca.id
    and (p_from is null or scl.created_at >= p_from)
    and (p_to is null or scl.created_at < p_to)
  where sca.organization_id = p_organization_id
    and c.archived_at is null
  group by c.id, c.customer_code, c.name, sca.balance
  order by sca.balance desc
  limit least(coalesce(p_limit, 500), 1000);
end;
$$;

-- docs/PRD.md §28's "layaway" customer report, and the layaway half of §27's
-- accounting liabilities. `outstanding` is the business's obligation: goods
-- reserved and partly paid for.
create or replace function public.report_layaways(
  p_organization_id uuid,
  p_branch_id uuid default null,
  p_business_unit_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_status text default null,
  p_limit int default 500
)
returns table (
  layaway_id uuid,
  reference text,
  customer_name text,
  branch_name text,
  status text,
  total_amount numeric,
  amount_paid numeric,
  outstanding numeric,
  payment_count bigint,
  created_at timestamptz,
  completed_at timestamptz
)
language plpgsql
security invoker
stable
set search_path = public
as $$
begin
  if p_status is not null and p_status not in ('active', 'paid', 'cancelled') then
    raise exception 'unsupported layaway status %', p_status using errcode = 'P0004';
  end if;

  return query
  select
    l.id,
    l.reference,
    coalesce(c.name, 'Unknown customer'),
    coalesce(b.name, 'Unknown branch'),
    l.status,
    l.total_amount,
    l.amount_paid,
    l.total_amount - l.amount_paid,
    coalesce(pay.payment_count, 0)::bigint,
    l.created_at,
    l.completed_at
  from public.layaways l
  left join public.customers c on c.id = l.customer_id
  left join public.branches b on b.id = l.branch_id
  left join lateral (
    select count(*) as payment_count
    from public.layaway_payments lp
    where lp.layaway_id = l.id
  ) pay on true
  where l.organization_id = p_organization_id
    and (p_branch_id is null or l.branch_id = p_branch_id)
    and (p_business_unit_id is null or l.business_unit_id = p_business_unit_id)
    and (p_status is null or l.status = p_status)
    and (p_from is null or l.created_at >= p_from)
    and (p_to is null or l.created_at < p_to)
  order by l.created_at desc
  limit least(coalesce(p_limit, 500), 1000);
end;
$$;
