-- Milestone 15 audit finding 5 (LOW) — see
-- docs/milestones/15-audit/findings-and-fixes.md.
--
-- Found by the catalog sweep this milestone added
-- (tests/integration/security-sweep.test.ts), not by reading the
-- migrations — which is the point of writing that test. Every migration
-- that deliberately exposes a function pairs `revoke ... from public` with
-- an explicit `grant`. Six functions were never given either, and in
-- Postgres a function with a NULL proacl defaults to EXECUTE for PUBLIC —
-- which includes `anon`. Reading the migration files gives no hint of this;
-- the privilege comes from the absence of a statement, not the presence of
-- one, so only the catalog shows it.
--
-- Severity is low and worth stating honestly rather than inflating:
--
--   * The five trigger functions cannot be invoked directly at all.
--     Postgres refuses to call a function returning `trigger` outside a
--     trigger context ("trigger functions can only be called as triggers"),
--     and PostgREST does not expose them. Three are SECURITY DEFINER, so
--     they would be a real escalation if they were reachable — they are not.
--   * billing_period_interval() is genuinely callable by anon, but it is
--     SECURITY INVOKER, pure, and returns an interval computed from its
--     argument. It reads nothing and leaks nothing.
--
-- So this fixes no exploit. It is worth doing because "every function's
-- privileges are stated explicitly" is a property the sweep test can
-- enforce, whereas "every function is either explicitly granted or harmless
-- by accident" is not. Closing these six lets ANON_EXECUTABLE_FUNCTIONS in
-- that test list only functions that are deliberately anon-callable, so a
-- future function that forgets its revoke fails the build instead of
-- blending in.
--
-- Revoking EXECUTE on a trigger function does NOT break its triggers.
-- Postgres checks EXECUTE permission on the function when the trigger is
-- CREATED, not on each firing, and all of these triggers already exist. The
-- full integration suite — which signs users up (handle_new_auth_user),
-- creates business units (seed_business_unit_capabilities), inserts product
-- variants (sync_product_variant_business_unit_id), assigns roles
-- (validate_user_role_scope) and updates rows on nearly every table
-- (set_updated_at) — is the empirical check that this holds.

revoke execute on function public.billing_period_interval(text) from public;
revoke execute on function public.handle_new_auth_user() from public;
revoke execute on function public.seed_business_unit_capabilities() from public;
revoke execute on function public.set_updated_at() from public;
revoke execute on function public.sync_product_variant_business_unit_id() from public;
revoke execute on function public.validate_user_role_scope() from public;

-- billing_period_interval() is the one of the six with real callers in
-- application-reachable SQL: the subscription functions (20260825100600)
-- call it while running as `authenticated`. The trigger functions need no
-- grant back, per the trigger-creation-time note above.
grant execute on function public.billing_period_interval(text) to authenticated, service_role;
