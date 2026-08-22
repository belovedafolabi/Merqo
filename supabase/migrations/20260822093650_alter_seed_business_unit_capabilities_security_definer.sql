-- Milestone 02's seed_business_unit_capabilities() trigger (fires on every
-- business_units insert) was written as SECURITY INVOKER, which was harmless
-- while business_units was only ever touched by migrations/seeds running as
-- the table owner. Now that this migration is about to give `authenticated`
-- users real INSERT access to business_units (Milestone 05's future Server
-- Actions), the trigger would otherwise try to insert into
-- business_unit_capabilities as that same authenticated user and be blocked
-- by RLS (no INSERT policy is authored on business_unit_capabilities in this
-- milestone — see 20260822094300_alter_business_unit_capabilities_add_policies.sql).
-- SECURITY DEFINER makes this internal, system-maintained side effect run
-- with the function owner's privileges regardless of who triggered it,
-- matching how the rest of this milestone's trigger/function pattern works.
create or replace function public.seed_business_unit_capabilities()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.business_unit_capabilities
    (business_unit_id, capability_id, enabled, is_override, created_by)
  select new.id, btc.capability_id, btc.default_enabled, false, new.created_by
  from public.business_type_capabilities btc
  where btc.business_type_id = new.business_type_id;
  return new;
end;
$$;
