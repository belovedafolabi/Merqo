# Milestone 15 — Findings & Fixes

The written summary the milestone's Deliverables call for: "a written summary
of findings and fixes (for the project owner's visibility into what this
hardening pass actually caught)."

Seven defects, all fixed in this branch. Nothing was deferred except one
latent issue with a documented owner and revisit trigger (finding 2's note).

---

## Finding 1 — HIGH — `anon` could forge audit rows for any organization

**Where.** `supabase/migrations/20260822093500_create_audit_functions.sql`
granted `EXECUTE` on `public.record_audit_event(uuid, uuid, text, text, uuid,
jsonb, inet, text)` to `anon`, so that a sessionless caller (a failed
sign-in, a rejected webhook) could still write its audit row.

**Why it matters.** Every argument of that function is caller-supplied —
`p_organization_id`, `p_user_id`, `p_action`, and a free-form `jsonb`
`p_metadata`. `NEXT_PUBLIC_SUPABASE_ANON_KEY` ships to every browser by
design. So anyone could `POST /rest/v1/rpc/record_audit_event` and inject
unlimited audit rows attributed to **any** organization and **any** user —
false "sign_in" events, forged "refund.approved" trails, or just volume to
bury a real entry. The `audit_logs` table's own append-only guarantee (no
UPDATE/DELETE grant, no INSERT policy) was intact; the hole was the breadth
of the one function allowed to append.

**Fix.** `supabase/migrations/20260826090200_create_auth_audit_event_function.sql`:

- New `record_unauthenticated_audit_event(p_action, p_identifier,
  p_ip_address, p_user_agent)`. It **allow-lists** the action (exactly two
  values), **derives** `resource_type` from the action, **derives**
  `user_id`/`resource_id` from `auth.uid()`, **hardcodes** `organization_id`
  to `null`, and **caps** metadata to one truncated `identifier` string.
- It **rate-limits itself in SQL** (30/min per IP) — the allow-list stops
  forgery, only the limit stops flooding, and enforcing it in SQL means
  calling the RPC directly with the anon key cannot bypass it.
- `EXECUTE` on the old `record_audit_event` is **revoked from `anon`**.
  `authenticated` keeps it — every remaining caller runs in a live session
  and legitimately needs the full argument surface.
- `app/(auth)/actions.ts`: the failed-sign-in path switches to the new RPC;
  the `auth.sign_in_blocked_subscription` audit call is **reordered above
  `signOut()`** so it runs authenticated and keeps its real
  org/user context (better evidence than the narrowed function could give).
- `app/api/webhooks/paystack/route.ts`: the rejected-signature path switches
  to the new RPC via `recordUnauthenticatedAuditEvent()`.

**Regression tests.** `tests/integration/hardening.test.ts` — anon is refused
`record_audit_event`; the new RPC rejects a non-allow-listed action; a forged
org/user is discarded; a 32-call flood trips at 30.
`tests/integration/audit.test.ts` — rewritten: the old "reachable pre-session
(anon)" assertion asserted exactly the vulnerability; it now asserts the new
contract on both sides.
`tests/integration/security-sweep.test.ts` — `record_audit_event` is no
longer in the anon-executable set.

---

## Finding 2 — MEDIUM — custom roles readable across organizations

**Where.** `roles_select` (`20260822094500`) and `role_permissions_select`
(`20260822094700`) were both `for select to authenticated using (true)`.

**Why it matters.** Those policies were correct when written — Milestone 03
seeded a fixed set of system roles, a global catalog that leaks nothing.
Milestone 11's custom-role builder then made `roles` a table that also holds
tenant-authored rows, without revisiting the policy. Since then, any
authenticated user of any organization could read every other organization's
custom role names and their exact permission mappings — a description of how
a competitor structures staff authority, and a target map. This is precisely
the interaction class Milestone 15 exists to catch: each policy individually
correct, the gap opened by a later milestone changing what the table holds.

**Fix.** `supabase/migrations/20260826090300_alter_roles_restrict_cross_org_select.sql`:
both policies now require the role to be a system role, authored by the
caller, or authored by someone in the caller's organization
(`user_shares_org_with(created_by)` — a helper that already existed and backs
`users_select`). A `role_is_visible(role_id)` helper keeps the predicate in
one place.

**Verified safe before shipping.** Permission resolution does **not** read
`role_permissions` through PostgREST — `lib/auth/context.ts` calls the
`SECURITY DEFINER` `current_user_permission_grants()` RPC, unaffected by these
policies. Had it read the table directly, this change would have stripped
every custom-role holder of their permissions at sign-in. A regression test
(`hardening.test.ts` → "sign-in still resolves permissions for a user holding
a custom role") guards that specifically.

**Known limitation — deferred to Milestone 16, with an owner.** `roles` has
no `organization_id` column (`20260822090900` deliberately declined scope
columns), so the predicate goes through `created_by`, which is
`ON DELETE SET NULL`. Deleting an author's auth identity would orphan their
custom role into invisibility for everyone. Unreachable today — Milestone 11
deactivates users (`deactivated_at`) and never deletes rows. The durable fix
is adding `roles.organization_id`, backfilled from the creator. Logged in
`docs/milestones/DECISIONS_AND_CONFLICTS.md`.

---

## Finding 3 — LOW — `markRead` notification actions had no guard and no validation

**Where.** `app/(app)/notifications/actions.ts` — `markReadAction` and
`markAllReadAction` took `notificationId` / `organizationId` straight from
`FormData` with no `requireUser()` and no Zod parse. They were the only
mutations in the app with neither.

**Why it matters.** RLS (`notifications_update_self`) was, and remains, the
security boundary — this is not a hole data is read through. The practical
problems: an unauthenticated `POST` reached PostgREST and was silently
no-op'd rather than redirected to sign-in, and an unvalidated string produced
a raw `invalid input syntax for type uuid` error that the Server Action
surfaced to the user verbatim.

**Fix.** `lib/notifications/mutations.ts` now calls `requireUser()` and
parses `notificationIdSchema` / `organizationIdSchema`
(`lib/notifications/schemas.ts`). `requireUser()`, not `requirePermission()`
— the file's existing reasoning that no permission key applies to a user's
own notifications still stands; "no permission key" is a different question
from "no session required".

**Regression test.** `tests/integration/hardening.test.ts` → "notification
mark-read validates its input".

---

## Finding 4 — LOW — `set_updated_at()` did not pin `search_path`

**Where.** `supabase/migrations/20260822090000` — the one function in the
schema without `set search_path = public`.

**Why it matters.** Genuinely low: it is a `SECURITY INVOKER` trigger
function that touches no schema-qualified object, so no exploit exists. It
trips Supabase's `function_search_path_mutable` lint, and — more usefully —
it was the one exception standing between the sweep test and an absolute
"every SECURITY DEFINER function pins search_path" rule.

**Fix.** `supabase/migrations/20260826090400_alter_set_updated_at_pin_search_path.sql`
— `create or replace` with the pin. OID preserved, so no trigger needs
re-creating.

---

## Finding 5 — LOW — six internal functions defaulted to `PUBLIC EXECUTE`

**Where.** Surfaced by the catalog sweep, not by reading migrations — which
is the point of the sweep. `billing_period_interval`, `handle_new_auth_user`,
`seed_business_unit_capabilities`, `set_updated_at`,
`sync_product_variant_business_unit_id`, `validate_user_role_scope` had never
had a `GRANT` or `REVOKE` applied. In Postgres a `NULL` `proacl` means
`EXECUTE` for `PUBLIC`, which includes `anon`. Reading the migration files
gives no hint — the privilege comes from the absence of a statement.

**Why it matters.** Low. Five of the six return `trigger` and cannot be
invoked directly at all (Postgres refuses; PostgREST does not expose them) —
though three are `SECURITY DEFINER` and would be a real escalation if they
were reachable. `billing_period_interval()` is genuinely callable by `anon`
but is `SECURITY INVOKER`, pure, and returns an interval computed from its
argument.

**Fix.** `supabase/migrations/20260826090500_revoke_public_execute_on_internal_functions.sql`
— `revoke execute ... from public` on all six; `billing_period_interval`
re-granted to `authenticated, service_role` (its real callers). This lets the
sweep's anon allow-list contain only functions that are *deliberately*
anon-callable, so a future function that forgets its revoke fails the build.

**Regression test.** `tests/integration/security-sweep.test.ts` → "only the
documented functions are executable by anon" (uses `pg_proc.proacl` +
`aclexplode` with an `acldefault()` fallback, so NULL-acl functions are
caught).

---

## Finding 6 — LOW — `db-migrations` CI job ran regardless of `quality`

**Where.** `.github/workflows/ci.yml` — the `db-migrations` job had no
`needs:`, so it spun up Supabase and ran the integration suite even on a
branch that failed lint or typecheck.

**Fix.** `needs: quality` added. Also in the same commit: a new `deps-audit`
job running `pnpm audit --prod --audit-level high` as a genuine gate (the
`pnpm-workspace.yaml` `auditConfig` block is the escape hatch for an
unfixable advisory — see `dependency-triage.md`).

---

## Finding 7 — LOW — five admin pages had no server-side permission gate

**Where.** `app/(app)/products/page.tsx`, `inventory/page.tsx`,
`customers/page.tsx`, `layaways/page.tsx`, `business-structure/page.tsx`.

**Why it matters.** Each of these pages' own doc comment says "gated on
`<module>.view`" — but the gate lived only in the nav (`<Can>` around the
sidebar link) and in the mutations (`requirePermission` in
`lib/<domain>/mutations.ts`). A user whose role lacks the `.view` permission
but who typed the URL, or followed a stale bookmark, got the **full
management UI** — the "New product" button, the product/customer/branch
tables. RLS kept the *data* correct (their own org's rows, which a till user
can already read for the POS) and every create/edit action still refused, so
this is defense-in-depth, not a data breach. But it is inconsistent with
`reports`, `employees`, `expenses` and `roles`, which all call
`requirePermission` in the page — a doc/impl mismatch across five files, and
exactly the "individually fine, inconsistent as a system" class this
milestone exists to catch.

Found by writing `tests/e2e/authenticated/limited/permission-boundaries.spec.ts`
as a real Cashier: the spec expected `/products` to hit the route error
boundary the way `/roles` does, and it did not.

**Fix.** `await requirePermission('<module>.view', { organizationId })` added
to all five page components, right after the `organizationId` is resolved,
matching the four pages that already do it. A Cashier now gets the same
route-error state on `/products` as on `/roles`.

**Regression test.** `permission-boundaries.spec.ts` → the `REFUSED_ROUTES`
loop asserts each of `/roles`, `/products`, `/inventory`, `/customers`,
`/business-structure` shows "Something went wrong" and no create control for
the Cashier.

---

## Gaps closed (predicted by the milestone, not defects)

| Gap | Closed by |
|-----|-----------|
| No rate limiting beyond login throttling | `lib/rate-limit/` + `rate_limits` table + `consume_rate_limit()`; buckets on login, password-reset, webhook, checkout, and the unauthenticated audit RPC. See `rate-limiting.md`. |
| No consolidated RLS/authorization regression guard | `tests/integration/security-sweep.test.ts` — catalog introspection, self-documenting allow-list. |
| No high-concurrency POS test (only 2-actor lock races existed) | `tests/integration/pos-load.test.ts` — 50 concurrent `create_sale` against constrained stock; 20 concurrent retries of one idempotency key. |
| Chromium-only E2E | `PLAYWRIGHT_BROWSERS` factory in `playwright.config.ts` + `.github/workflows/cross-browser.yml` (nightly chromium + firefox + webkit). |
| No cross-milestone journey coverage | `tests/e2e/authenticated/journey-onboarding.spec.ts`, `journey-sale-to-report.spec.ts`. |
| Single Owner-only E2E fixture — no way to test a real permission boundary or cross-tenant isolation | `seedE2EFixture()` extended with a limited Cashier user and a second organization; `tests/e2e/authenticated/limited/`. |
