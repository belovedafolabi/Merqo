-- Milestone 17 Part A — the short-lived cache the Sales Insights page reads.
--
-- =============================================================================
-- WHY A CACHE TABLE
-- =============================================================================
-- A page load computes insights at request time via compute_sales_insights()
-- (20260905090300), writes the result here, and serves subsequent loads
-- straight from these rows until they age past a staleness window (6h,
-- lib/insights/types.ts). No pg_cron job — matches docs/TAS.md §34 ("introduce
-- materialized views / aggregation tables only if profiling later demonstrates
-- a real need"). If the page is ever slow at scale a nightly refresh can be
-- layered on without changing the read path.
--
-- =============================================================================
-- SHAPE
-- =============================================================================
-- One row per (business_unit_id, section). `section` — not `horizon`: the
-- forecast payload already carries all three horizons per product, and restock
-- / slow-movers are not per-horizon, so a horizon key would just duplicate
-- rows. Exactly three rows per business unit.
--
-- =============================================================================
-- ACCESS
-- =============================================================================
-- SELECT only, and gated on `insights.view` in the policy itself, not merely
-- `user_has_org_access` — the same two-boundary pattern Reports uses (the
-- Server Action guard AND row-level scoping). No INSERT/UPDATE/DELETE grant to
-- `authenticated`: only compute_sales_insights() (SECURITY DEFINER) writes it.
-- Standard convention: RLS enabled here, an explicit grant precedes the policy
-- (a table with a policy but no grant 42501s).

create table public.sales_insights_cache (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  business_unit_id uuid not null references public.business_units(id) on delete cascade,

  section text not null check (section in ('forecast', 'restock', 'slow_movers')),
  payload jsonb not null,
  computed_at timestamptz not null default now(),

  unique (business_unit_id, section)
);

create index sales_insights_cache_organization_id_idx
  on public.sales_insights_cache (organization_id);

comment on table public.sales_insights_cache is
  'Milestone 17 Part A. Short-lived per-business-unit cache of computed sales '
  'insights (forecast / restock / slow_movers). Written only by '
  'compute_sales_insights(); read straight until 6h stale.';

alter table public.sales_insights_cache enable row level security;

grant select on public.sales_insights_cache to authenticated;

create policy sales_insights_cache_select on public.sales_insights_cache
  for select
  to authenticated
  using (
    public.user_has_org_access(organization_id)
    and public.user_has_permission('insights.view', organization_id)
  );

-- Permission + default role grants. Mirrors coupons.manage (20260904090300):
-- added to the seeded catalog in supabase/seed.sql (so a fresh db reset
-- matches) AND granted to every existing Owner and Branch Manager here, so
-- applying this migration to a live deployment is enough. Super Admin picks it
-- up via seed.sql's platform cross-join.
insert into public.permissions (key, resource, action, description) values
  (
    'insights.view',
    'insights',
    'view',
    'View the Sales Insights page — per-product demand forecasts, restock suggestions, and slow-mover promo candidates.'
  )
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'insights.view'
where r.slug in ('owner', 'branch_manager')
on conflict (role_id, permission_id) do nothing;
