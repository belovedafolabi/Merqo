-- Milestone 15 audit finding 4 (LOW) — see
-- docs/milestones/15-audit/findings-and-fixes.md.
--
-- public.set_updated_at() (20260822090000) is the one function in the schema
-- without a pinned search_path. Every other function — every SECURITY
-- DEFINER helper, and even the SECURITY INVOKER report_* functions — sets
-- `search_path = public`.
--
-- The severity here is genuinely low and worth stating plainly rather than
-- overselling: this is a SECURITY INVOKER trigger function, so it runs with
-- the privileges of whoever fired the trigger and cannot be used to escalate
-- the way an unpinned SECURITY DEFINER function could. Its body also touches
-- no schema-qualified object at all. The fix is for consistency and for
-- Supabase's `function_search_path_mutable` linter, not because an exploit
-- exists.
--
-- It is worth doing anyway because the sweep test added by this milestone
-- (tests/integration/security-sweep.test.ts) asserts that EVERY function
-- pins search_path. A single documented exception is how that assertion
-- starts accumulating an allow-list, and an allow-list is how the next
-- unpinned function — which might well be SECURITY DEFINER — gets waved
-- through. Closing the last instance keeps the rule absolute.
--
-- `create or replace` preserves the function's OID, so none of the ~40
-- `trg_*_updated_at` triggers that reference it need re-creating; they keep
-- pointing at the same function and pick the new body up immediately.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;
