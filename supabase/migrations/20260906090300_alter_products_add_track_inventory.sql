-- Milestone 17 Part B — products can opt out of stock tracking.
--
-- The `services` capability (20260906090400) sells non-stock line items: a
-- haircut, a room-service charge, a delivery fee. Those are "a product with
-- track_inventory = false" — this column is what makes that real.
--
-- Default TRUE, so every existing product keeps exactly its current
-- behaviour: create_sale() still deducts stock for it, and assertStockAvailable
-- still guards it. Only a product explicitly created as a service (the product
-- form sets the flag when the `services` capability is on) skips both.
--
-- The base products table (20260823100100) deliberately omitted this
-- ("Milestone 07's concern... added as an additive alter_products_* migration
-- when a later milestone has a concrete need"). This is that migration.

alter table public.products
  add column track_inventory boolean not null default true;

comment on column public.products.track_inventory is
  'Milestone 17 Part B: false for non-stock service line items — create_sale() '
  'skips the stock deduction and assertStockAvailable() skips the check.';
