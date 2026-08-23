-- Table-level grants for this milestone's new table and newly-mutable
-- table, per 20260822095000's own rule: a GRANT here plus the matching RLS
-- policy (previous migrations) is what actually makes a mutation reachable
-- by `authenticated` via PostgREST/supabase-js.
grant select, insert, update on public.business_unit_pos_config to authenticated;
grant update on public.business_unit_capabilities to authenticated;
