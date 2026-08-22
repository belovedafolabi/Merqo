-- Local/dev seed data for Milestone 02.
--
-- Idempotent by design (`on conflict ... do nothing` on each table's natural
-- key) so `supabase db reset` can run any number of times without erroring or
-- duplicating rows — this is how migration/seed idempotency is verified in CI
-- (see .github/workflows/ci.yml, job "db-migrations").

-- =============================================================================
-- 1. Business types — the 13 initial target businesses, per docs/PRD.md §6.
-- =============================================================================
insert into public.business_types (slug, name) values
  ('supermarket', 'Supermarket'),
  ('convenience_store', 'Convenience Store'),
  ('restaurant', 'Restaurant'),
  ('pharmacy', 'Pharmacy'),
  ('clothing_fashion', 'Clothing / Fashion Store'),
  ('electronics', 'Electronics Store'),
  ('hardware_building_materials', 'Hardware / Building-Material Store'),
  ('beauty_salons_barbers', 'Beauty Salon / Barber'),
  ('hotels', 'Hotel'),
  ('bakeries', 'Bakery'),
  ('wholesalers', 'Wholesaler'),
  ('general_retail', 'General Retail'),
  ('other', 'Other')
on conflict (slug) do nothing;

-- =============================================================================
-- 2. Capabilities — the curated catalog per
--    docs/milestones/02-database-and-core-domain-foundation.md Scope.
--    NOT the larger example list in docs/TAS.md §7 (table_management,
--    kitchen_management, prescription_management are explicitly deferred to
--    later milestones per that milestone doc's Future Considerations).
-- =============================================================================
insert into public.capabilities (key, name) values
  ('products', 'Products'),
  ('inventory', 'Inventory'),
  ('batch_tracking', 'Batch Tracking'),
  ('expiry_tracking', 'Expiry Tracking'),
  ('service_charge', 'Service Charge'),
  ('layaway', 'Layaway'),
  ('store_credit', 'Store Credit')
on conflict (key) do nothing;

-- =============================================================================
-- 3. Default capability matrix per business type (business_type_capabilities).
--
--    GROUNDED in the design corpus (docs/TAS.md §8): pharmacy, restaurant.
--    INFERRED (not explicitly stated in the corpus): the other 11 rows below
--    are a reasonable best-effort baseline, confirmed with the product owner
--    to ship now rather than block this milestone. Adjusting any of these is
--    a pure data change (edit this file, `pnpm db:reset`) — no migration
--    needed, since the schema itself is generic.
-- =============================================================================
with matrix (business_type_slug, capability_key) as (
  values
    -- Supermarket — INFERRED: general goods, shared stock, no batch/expiry-heavy ops by default.
    ('supermarket', 'products'), ('supermarket', 'inventory'), ('supermarket', 'expiry_tracking'),

    -- Convenience store — INFERRED: same shape as supermarket, smaller scale.
    ('convenience_store', 'products'), ('convenience_store', 'inventory'), ('convenience_store', 'expiry_tracking'),

    -- Restaurant — GROUNDED (docs/TAS.md §8): inventory, service charges.
    ('restaurant', 'products'), ('restaurant', 'inventory'), ('restaurant', 'service_charge'),

    -- Pharmacy — GROUNDED (docs/TAS.md §8 / docs/PRD.md §26): inventory,
    -- batch tracking, expiry tracking (regulated, dated stock).
    ('pharmacy', 'products'), ('pharmacy', 'inventory'), ('pharmacy', 'batch_tracking'), ('pharmacy', 'expiry_tracking'),

    -- Clothing/fashion — INFERRED: no expiry, but layaway/store credit are common in this vertical.
    ('clothing_fashion', 'products'), ('clothing_fashion', 'inventory'), ('clothing_fashion', 'layaway'), ('clothing_fashion', 'store_credit'),

    -- Electronics — INFERRED: high-ticket items, layaway/store credit common.
    ('electronics', 'products'), ('electronics', 'inventory'), ('electronics', 'layaway'), ('electronics', 'store_credit'),

    -- Hardware/building materials — INFERRED: high-ticket, bulk purchase, layaway/credit common.
    ('hardware_building_materials', 'products'), ('hardware_building_materials', 'inventory'), ('hardware_building_materials', 'layaway'), ('hardware_building_materials', 'store_credit'),

    -- Beauty salons/barbers — INFERRED: retail products with expiry (cosmetics) plus service charges.
    ('beauty_salons_barbers', 'products'), ('beauty_salons_barbers', 'inventory'), ('beauty_salons_barbers', 'expiry_tracking'), ('beauty_salons_barbers', 'service_charge'),

    -- Hotels — INFERRED: service-charge-heavy (room/service fees), light retail inventory.
    ('hotels', 'products'), ('hotels', 'inventory'), ('hotels', 'service_charge'),

    -- Bakeries — INFERRED: perishable goods, expiry tracking matters.
    ('bakeries', 'products'), ('bakeries', 'inventory'), ('bakeries', 'expiry_tracking'),

    -- Wholesalers — INFERRED: bulk B2B, layaway/store credit common for repeat trade customers.
    ('wholesalers', 'products'), ('wholesalers', 'inventory'), ('wholesalers', 'layaway'), ('wholesalers', 'store_credit'),

    -- General retail / Other — INFERRED: conservative baseline, no assumptions beyond core POS.
    ('general_retail', 'products'), ('general_retail', 'inventory'),
    ('other', 'products'), ('other', 'inventory')
)
insert into public.business_type_capabilities (business_type_id, capability_id, default_enabled)
select bt.id, c.id, true
from matrix m
join public.business_types bt on bt.slug = m.business_type_slug
join public.capabilities c on c.key = m.capability_key
on conflict (business_type_id, capability_id) do nothing;

-- Explicitly fill every remaining (business_type, capability) pair not listed
-- above with default_enabled = false, so the table is a complete 13x7 = 91-row
-- matrix rather than relying on implicit absence (every pair is queryable and
-- testable, none are "missing" by omission).
insert into public.business_type_capabilities (business_type_id, capability_id, default_enabled)
select bt.id, c.id, false
from public.business_types bt
cross join public.capabilities c
on conflict (business_type_id, capability_id) do nothing;

-- =============================================================================
-- roles / permissions / role_permissions / user_roles / audit_logs
-- intentionally have NO seed data in this milestone — default role and
-- permission catalog seeding is Milestone 03's Database Changes
-- (docs/milestones/03-authentication-and-rbac-foundation.md). See
-- tests/integration/seed.test.ts, which asserts these tables stay empty
-- until Milestone 03 populates them.
-- =============================================================================
