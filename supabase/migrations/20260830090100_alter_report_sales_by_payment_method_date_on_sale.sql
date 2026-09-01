-- Milestone 16 §1.3 — one report escaped Milestone 10's query-analysis index
-- pass, found by re-running that analysis at realistic volume.
--
-- report_sales_by_payment_method ranges its date predicate on
-- `payments.created_at`. `payments` carries exactly one index —
-- payments_sale_id_idx (20260823120200) — so there is nothing for that range
-- to use, and the `sales` half of the join has no date predicate either, so
-- sales_organization_created_at_idx (20260823140800) cannot narrow it. The
-- planner's only options are to read every payment the organization has ever
-- taken, or to sequential-scan `payments` outright. This is structurally the
-- same defect 20260823140800 fixed for `sales`, in the report that pass
-- missed.
--
-- Fix: range on `sales.created_at` instead. Every `payments` row is written
-- inside `create_sale()` (20260823140700) in the same transaction as its
-- sale, so `payments.created_at` and `sales.created_at` differ by
-- microseconds — the reported totals do not move — and every *other* report
-- in 20260823141000 already dates off the parent sale. With the range on
-- `s.created_at`, sales_organization_created_at_idx drives the whole query
-- and `payments` is reached only by its sale_id foreign key.
--
-- Considered and rejected: adding payments_created_at_idx. It would add write
-- amplification to the second-hottest insert path in the product (a payments
-- row per sale) to preserve a distinction — payment time vs. sale time — that
-- does not exist while Milestone 08 excludes split payments. If split
-- payments are ever added with their own capture timestamps, revisit both the
-- date semantics and the index together.
--
-- Body is otherwise byte-identical to 20260823141000's definition.

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
    and (p_from is null or s.created_at >= p_from)
    and (p_to is null or s.created_at < p_to)
  group by pay.method
  order by sum(pay.amount) desc
  limit least(coalesce(p_limit, 500), 1000);
end;
$$;
