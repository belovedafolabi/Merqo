-- A Business Unit's POS configuration (docs/milestones/05-business-structure-
-- and-onboarding.md Scope): tax rate, service charge, discount policy,
-- default payment method. One row per Business Unit — modeled as its own
-- table (mirroring business_unit_capabilities' own precedent) rather than
-- columns bolted onto business_units, since it's a cohesive, independently
-- evolving settings group that Milestone 08's POS engine reads as a unit.
--
-- `default_payment_method` is a small fixed check-constrained set for now,
-- not a `payment_methods` table — that domain belongs to Milestone 08's POS
-- Transaction Engine; inventing it here would be exactly the "painted into a
-- corner" risk this milestone's own doc warns against in the other
-- direction (over-rigid tax modeling). A real payment-methods domain, if
-- Milestone 08 needs one, can migrate this column without disrupting the
-- rest of this table.
create table public.business_unit_pos_config (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null unique references public.business_units(id) on delete cascade,

  tax_rate numeric(5, 2) not null default 0
    check (tax_rate >= 0 and tax_rate <= 100),

  service_charge_enabled boolean not null default false,
  service_charge_type text not null default 'percentage'
    check (service_charge_type in ('percentage', 'fixed')),
  service_charge_value numeric(10, 2) not null default 0
    check (
      service_charge_value >= 0
      and (service_charge_type = 'fixed' or service_charge_value <= 100)
    ),

  -- Discount policy: who can discount is enforced by the *permission system*
  -- (business_units.configure_pos gates editing this policy; Milestone 08's
  -- checkout enforces discount_requires_authorization against the acting
  -- user's own permissions at sale time) — no separate "who" column needed
  -- here, only the guardrail flags/limits themselves.
  discount_requires_authorization boolean not null default true,
  discount_max_percentage numeric(5, 2) not null default 0
    check (discount_max_percentage >= 0 and discount_max_percentage <= 100),
  discount_max_amount numeric(12, 2)
    check (discount_max_amount is null or discount_max_amount >= 0),
  discount_reason_required boolean not null default true,

  default_payment_method text not null default 'cash'
    check (default_payment_method in ('cash', 'card', 'transfer')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null
);

create trigger trg_business_unit_pos_config_updated_at
  before update on public.business_unit_pos_config
  for each row execute function public.set_updated_at();

alter table public.business_unit_pos_config enable row level security;
