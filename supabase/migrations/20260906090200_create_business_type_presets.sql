-- Milestone 17 Part B — per-business-type onboarding presets.
--
-- Consumed ONCE, at the end of onboarding, to give a freshly-created business
-- unit a sensible starting dashboard and a pinned-reports list instead of the
-- generic default. NOT a runtime gate — after onboarding the owner changes
-- everything freely and this table is never consulted again for that unit.
-- lib/business-structure/presets.ts's applyBusinessTypePresets() is the only
-- reader.
--
--   preset_kind = 'dashboard_widgets' — payload is a JSON array of widget_id
--     strings (a subset of lib/dashboard/widgets.ts's WIDGET_IDS). Applied to
--     the ONBOARDING USER's dashboard_widgets rows only: that table is
--     per-user with no org/BU column, so this is the closest honest version of
--     "seed the unit's dashboard".
--   preset_kind = 'pinned_reports' — payload is a JSON array of standard-report
--     ids (lib/reports/catalog.ts). Written to business_units.pinned_reports.
--
-- Same platform-reference policy shape as business_type_terminology /
-- business_type_category_suggestions.

create table public.business_type_presets (
  id uuid primary key default gen_random_uuid(),
  business_type_id uuid not null references public.business_types(id) on delete cascade,
  preset_kind text not null check (preset_kind in ('dashboard_widgets', 'pinned_reports')),
  payload jsonb not null,
  created_at timestamptz not null default now(),

  unique (business_type_id, preset_kind)
);

alter table public.business_type_presets enable row level security;

grant select on public.business_type_presets to authenticated;

create policy business_type_presets_select on public.business_type_presets
  for select
  to authenticated
  using (true);

-- The pinned-reports list lives on the business unit it belongs to — settings
-- as a column on the owning entity, the shape organizations.receipt_* uses.
-- Existing units get '[]' and their Reports index is visually unchanged.
alter table public.business_units
  add column pinned_reports jsonb not null default '[]'::jsonb;

comment on column public.business_units.pinned_reports is
  'Milestone 17 Part B: standard-report ids to surface first on the Reports '
  'index for this unit. Seeded once at onboarding from business_type_presets, '
  'owner-editable after.';

-- Seed both kinds for every business type. Mirrored in supabase/seed.sql.
with widget_presets (business_type_slug, payload) as (
  values
    ('supermarket', '["sales_summary","sales_overview","low_stock","recent_sales"]'::jsonb),
    ('convenience_store', '["sales_summary","sales_overview","low_stock","recent_sales"]'::jsonb),
    ('restaurant', '["sales_summary","sales_overview","recent_sales","top_products"]'::jsonb),
    ('pharmacy', '["sales_summary","sales_overview","low_stock","recent_products"]'::jsonb),
    ('clothing_fashion', '["sales_summary","sales_overview","top_products","low_stock"]'::jsonb),
    ('electronics', '["sales_summary","sales_overview","top_products","low_stock"]'::jsonb),
    ('hardware_building_materials', '["sales_summary","sales_overview","low_stock","recent_sales"]'::jsonb),
    ('beauty_salons_barbers', '["sales_summary","sales_overview","recent_sales","top_products"]'::jsonb),
    ('hotels', '["sales_summary","sales_overview","recent_sales"]'::jsonb),
    ('bakeries', '["sales_summary","sales_overview","low_stock","top_products"]'::jsonb),
    ('wholesalers', '["sales_summary","sales_performance","top_products","recent_sales"]'::jsonb),
    ('general_retail', '["sales_summary","sales_overview","low_stock","recent_sales"]'::jsonb),
    ('other', '["sales_summary","sales_overview","low_stock","recent_sales"]'::jsonb)
),
report_presets (business_type_slug, payload) as (
  values
    ('supermarket', '["sales-summary","sales-by-product","inventory-low-stock"]'::jsonb),
    ('convenience_store', '["sales-summary","sales-by-product","inventory-low-stock"]'::jsonb),
    ('restaurant', '["sales-summary","sales-by-product","discounts"]'::jsonb),
    ('pharmacy', '["sales-summary","sales-by-product","inventory-expiry","inventory-low-stock"]'::jsonb),
    ('clothing_fashion', '["sales-summary","sales-by-product","customer-layaways"]'::jsonb),
    ('electronics', '["sales-summary","sales-by-product","inventory-stock"]'::jsonb),
    ('hardware_building_materials', '["sales-summary","sales-by-product","inventory-stock"]'::jsonb),
    ('beauty_salons_barbers', '["sales-summary","sales-by-product","discounts"]'::jsonb),
    ('hotels', '["sales-summary","sales-by-product"]'::jsonb),
    ('bakeries', '["sales-summary","sales-by-product","inventory-low-stock"]'::jsonb),
    ('wholesalers', '["sales-summary","sales-by-product","customer-transactions"]'::jsonb),
    ('general_retail', '["sales-summary","sales-by-product","inventory-low-stock"]'::jsonb),
    ('other', '["sales-summary","sales-by-product"]'::jsonb)
)
insert into public.business_type_presets (business_type_id, preset_kind, payload)
select bt.id, 'dashboard_widgets', wp.payload
from widget_presets wp
join public.business_types bt on bt.slug = wp.business_type_slug
union all
select bt.id, 'pinned_reports', rp.payload
from report_presets rp
join public.business_types bt on bt.slug = rp.business_type_slug
on conflict (business_type_id, preset_kind) do nothing;
