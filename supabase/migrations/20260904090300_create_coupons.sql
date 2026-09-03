-- Discount coupons — a code a customer gives at checkout for a fixed or
-- percentage discount off the sale.
--
-- =============================================================================
-- WHY THIS EXISTS
-- =============================================================================
-- The design corpus never spec'd coupons (docs/PRD.md's Non-Goals name
-- "customer loyalty" and "gift cards" but not promo codes), and Milestone 08
-- shipped only a manual, permission-gated checkout discount. This adds the
-- smallest useful coupon engine: an Owner or Branch Manager defines codes in
-- Settings -> Coupons, and any cashier can redeem one at the till. It plugs
-- into the EXISTING discount stage of lib/sales/calculations.ts — a redeemed
-- coupon resolves to an amount that is added to sales.discount_amount — rather
-- than introducing a parallel money path.
--
-- SCOPE (deliberately minimal): per-organization codes, fixed or percentage
-- value, an optional active window, an optional minimum spend, and an optional
-- total-redemption cap. No per-customer limits, no product/category targeting,
-- no stacking rules beyond "coupon and any manual discount sum, capped at the
-- subtotal" (which calculateDiscount already enforces).
--
-- =============================================================================
-- CONVENTIONS
-- =============================================================================
-- Standard UUID pk + audit columns + set_updated_at trigger
-- (docs/architecture/database-conventions.md). Soft-delete via `archived_at`
-- (operational tenant data, like units_of_measure), so a retired code's text
-- can be reused by a new one. RLS enabled in this file; an explicit table
-- grant precedes the policies (a table with policies but no grant 42501s).
--
-- SELECT is open to any org member, not gated on coupons.manage: a cashier
-- with no admin permission still has to look a code up to redeem it, and a
-- coupon list is low-sensitivity. INSERT/UPDATE require coupons.manage. No
-- DELETE — archive instead. redemption_count is bumped only by create_sale()
-- (SECURITY DEFINER, 20260904090500), which bypasses RLS, so the cashier's
-- redemption is not blocked by the coupons.manage check on UPDATE.

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,

  code text not null,
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(14, 2) not null check (discount_value > 0),
  minimum_purchase numeric(14, 2) not null default 0 check (minimum_purchase >= 0),
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  starts_at timestamptz,
  expires_at timestamptz,
  archived_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,

  constraint coupons_code_not_blank check (length(trim(code)) > 0),
  constraint coupons_percentage_range
    check (discount_type <> 'percentage' or discount_value <= 100),
  constraint coupons_window_valid
    check (starts_at is null or expires_at is null or expires_at > starts_at)
);

-- Codes are matched case-insensitively; unique per org among live rows, so an
-- archived code frees up for reuse (same partial-uniqueness dance as
-- units_of_measure / categories).
create unique index coupons_org_code_key
  on public.coupons (organization_id, upper(code))
  where archived_at is null;

create index coupons_organization_id_idx on public.coupons (organization_id);

create trigger trg_coupons_updated_at
  before update on public.coupons
  for each row execute function public.set_updated_at();

comment on table public.coupons is
  'Checkout discount codes, per organization. A redeemed coupon resolves to an '
  'amount folded into sales.discount_amount; sales.coupon_id records which one. '
  'redemption_count is maintained only by create_sale().';

alter table public.coupons enable row level security;

grant select, insert, update on public.coupons to authenticated;

create policy coupons_select on public.coupons
  for select
  to authenticated
  using (public.user_has_org_access(organization_id));

create policy coupons_insert on public.coupons
  for insert
  to authenticated
  with check (
    public.user_has_org_access(organization_id)
    and public.user_has_permission('coupons.manage', organization_id)
    and created_by = auth.uid()
  );

create policy coupons_update on public.coupons
  for update
  to authenticated
  using (
    public.user_has_org_access(organization_id)
    and public.user_has_permission('coupons.manage', organization_id)
  )
  with check (
    public.user_has_org_access(organization_id)
    and public.user_has_permission('coupons.manage', organization_id)
  );

-- Permission + default role grants. Mirrors units.manage (20260902090000):
-- added to the seeded catalog in supabase/seed.sql (so a fresh db reset
-- matches) AND granted to every existing Owner and Branch Manager here, so
-- applying this migration to a live deployment is enough.
insert into public.permissions (key, resource, action, description) values
  ('coupons.manage', 'coupons', 'manage', 'Create, edit, and archive checkout discount coupons.')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'coupons.manage'
where r.slug in ('owner', 'branch_manager')
on conflict (role_id, permission_id) do nothing;
