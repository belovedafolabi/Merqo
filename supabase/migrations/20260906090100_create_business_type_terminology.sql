-- Milestone 17 Part B — per-business-type wording for a small, fixed set of
-- user-facing nouns. A "Sale" reads as a "Bill" for a restaurant, a "Ticket"
-- for a salon, an "Order" for a wholesaler, and so on, across POS, receipts,
-- reports and nav.
--
-- A seeded reference table, NOT a slug->map in application code — the same
-- rule business_type_capabilities and business_type_category_suggestions
-- follow: a business type is a configuration template, never a hard-coded
-- behaviour branch. A Super Admin can curate the lists later without a
-- deploy.
--
-- Six term_keys, deliberately few and generic. A type with no row for a key
-- (or a key the resolver doesn't know) falls back to the built-in generic
-- term — see lib/terminology/types.ts's GENERIC_TERMS. So only the types
-- whose vocabulary genuinely differs need rows; supermarket / general_retail /
-- other correctly use the generic words and are intentionally left unseeded.
--
-- Platform reference data (it describes business_types, not a tenant's rows):
-- readable by any authenticated user, migration/seed-managed only. Policy
-- shape copied verbatim from business_type_category_suggestions
-- (20260830090200).

create table public.business_type_terminology (
  id uuid primary key default gen_random_uuid(),
  business_type_id uuid not null references public.business_types(id) on delete cascade,
  term_key text not null check (
    term_key in ('sale', 'customer', 'product', 'cart', 'receipt', 'catalog')
  ),
  singular text not null,
  plural text not null,
  created_at timestamptz not null default now(),

  unique (business_type_id, term_key),
  constraint business_type_terminology_not_blank
    check (length(trim(singular)) > 0 and length(trim(plural)) > 0)
);

create index business_type_terminology_type_idx
  on public.business_type_terminology (business_type_id);

alter table public.business_type_terminology enable row level security;

grant select on public.business_type_terminology to authenticated;

create policy business_type_terminology_select on public.business_type_terminology
  for select
  to authenticated
  using (true);

-- Seed the types with distinctive vocabulary. Also mirrored in
-- supabase/seed.sql so a fresh `db reset` matches.
with terms (business_type_slug, term_key, singular, plural) as (
  values
    -- Restaurant — a bill, guests, menu items.
    ('restaurant', 'sale', 'Bill', 'Bills'),
    ('restaurant', 'customer', 'Guest', 'Guests'),
    ('restaurant', 'product', 'Menu item', 'Menu items'),
    ('restaurant', 'cart', 'Order', 'Orders'),
    ('restaurant', 'catalog', 'Menu', 'Menus'),

    -- Beauty salon / barber — a ticket, clients, services.
    ('beauty_salons_barbers', 'sale', 'Ticket', 'Tickets'),
    ('beauty_salons_barbers', 'customer', 'Client', 'Clients'),
    ('beauty_salons_barbers', 'product', 'Service', 'Services'),
    ('beauty_salons_barbers', 'cart', 'Ticket', 'Tickets'),
    ('beauty_salons_barbers', 'catalog', 'Service menu', 'Service menus'),

    -- Hotel — a folio, guests, charges.
    ('hotels', 'sale', 'Folio', 'Folios'),
    ('hotels', 'customer', 'Guest', 'Guests'),
    ('hotels', 'product', 'Charge', 'Charges'),
    ('hotels', 'cart', 'Folio', 'Folios'),

    -- Wholesaler — an order, trade accounts.
    ('wholesalers', 'sale', 'Order', 'Orders'),
    ('wholesalers', 'customer', 'Account', 'Accounts'),
    ('wholesalers', 'cart', 'Order', 'Orders'),

    -- Pharmacy — a dispense, patients, items.
    ('pharmacy', 'sale', 'Sale', 'Sales'),
    ('pharmacy', 'customer', 'Patient', 'Patients'),

    -- Hardware / building materials — an order, trade customers.
    ('hardware_building_materials', 'sale', 'Order', 'Orders'),
    ('hardware_building_materials', 'cart', 'Order', 'Orders')
)
insert into public.business_type_terminology (business_type_id, term_key, singular, plural)
select bt.id, t.term_key, t.singular, t.plural
from terms t
join public.business_types bt on bt.slug = t.business_type_slug
on conflict (business_type_id, term_key) do nothing;
