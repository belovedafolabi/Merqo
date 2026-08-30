# Server Action & Route Handler authorization checklist

Every `'use server'` module (18) and every `app/**/route.ts` (5), checked for
a permission guard or a documented public reason.

## How the guard is wired

`app/**/actions.ts` files are thin `FormData` / JSON parsers. The
`requirePermission(key, scope)` call almost always lives one layer down in
`lib/<domain>/mutations.ts` (also `lib/reports/custom.ts`,
`lib/receipts/settings.ts`). `proxy.ts` does route-gating + session refresh
only and is explicitly **not** the security boundary. RLS + `SECURITY
DEFINER` RPCs are the database-level backstop.

**Count:** 85 exported async functions. 62 mutations reach
`requirePermission` (directly or via their delegate). 12 are read-only query
wrappers relying on RLS. 6 are pre-auth auth actions. 5 are
self-scoped / bootstrap actions that deliberately skip the permission guard.

## Server Action modules

| Module | Guard | Notes |
|--------|-------|-------|
| `business-structure/actions.ts` | ✅ `requirePermission` in `lib/business-structure/mutations.ts` (`branches.*`, `business_units.*`, capability keys) | archive actions are ID-only, guarded, no Zod (low risk) |
| `customers/actions.ts` | ✅ mutations guarded (`customers.*`, `store_credit.*`, `layaway.*`); `searchCustomersAction` read-only, RLS | |
| `employees/actions.ts` | ✅ mutations guarded (`users.*`, invitations); `setEmployeeActiveAction` — permission + self-target + cross-org checks inside `set_employee_active()` SECURITY DEFINER RPC; Zod-parsed | ✅* guard is in the RPC, not the TS |
| `expenses/actions.ts` | ✅ `expense.*` in `lib/expenses/mutations.ts`; state changes via `decide_expense()` / `void_expense()` | |
| `inventory/actions.ts` | ✅ `inventory.*` in `lib/inventory/mutations.ts`; `listBranchProductOptionsAction` read-only, RLS | |
| `layaways/actions.ts` | ✅ `layaway.*`; `getLayawayAction` read-only, RLS | |
| `notifications/actions.ts` | ✅ **M15 finding 3:** `markReadAction` / `markAllReadAction` now call `requireUser()` + Zod in `lib/notifications/mutations.ts` | self-scoped by RLS (`user_id = auth.uid()`); no permission key applies |
| `products/actions.ts` | ✅ `products.*`, `categories.*`, pricing keys; archive actions ID-only | |
| `reports/actions.ts` | ✅ `reports.view` / `reports.export` / `reports.save` in `lib/reports/*` | |
| `roles/actions.ts` | ✅ `roles.*` in `lib/roles/mutations.ts` — belt-and-suspenders; the real boundary is the RLS escalation guard (`20260824090800/090900`) | ✅* headers say so explicitly |
| `settings/actions.ts` | ✅ branding / receipt-template keys; `updateNotificationPreferencesAction` — `getCurrentUser()` only (self-scoped) + Zod | ✅* self-scoped, no permission key |
| `settings/pricing/actions.ts` | ✅ pricing keys in `lib/business-structure/mutations.ts` | |
| `settings/subscription/actions.ts` | ✅ `subscription.renew` / `subscription.configure`; `initiateSubscriptionCheckout` also guarded | ✅* also RLS-bounded |
| `(auth)/actions.ts` | ⚪ pre-auth by design — `signUp` / `signIn` / `signOut` / `requestPasswordReset` / `confirmPasswordReset`; login-throttle + rate-limit + audit; manual presence checks | no session exists yet |
| `(auth)/invite/actions.ts` | ⚪ `acceptInvitationAction` — token + email-match enforced inside `accept_employee_invitation()` RPC | a visitor with no account must be able to accept |
| `(onboarding)/onboarding/actions.ts` | ⚪ `createOrganizationStepAction` → `createOrganizationForCurrentUser()` uses `supabase.auth.getUser()` only — no org/grants exist yet to check against; later steps guarded once the org exists | bootstrap |
| `(pos)/pos/actions.ts` | ✅ `checkoutAction` → `createSale` guarded (`sales.create`) + **M15 checkout rate limit**; hold/resume/discard guarded; `getSaleAction` / `getReceiptContextAction` / `listHeldSalesAction` / `searchProductsAction` / `lookupBarcodeAction` / `searchCustomersAction` / `getStoreCreditBalanceAction` read-only, RLS | |
| `(pos)/pos/returns/actions.ts` | ✅ `create_return` / `request_refund` guarded (`returns.create`, `refund.initiate`); `findSaleAction` / `listPendingRefundsAction` read-only, RLS | |

## Route Handlers

| Route | Method | Protection |
|-------|--------|-----------|
| `app/api/webhooks/paystack/route.ts` | POST | Paystack HMAC signature over the raw body + `webhook_events` idempotency ledger; bad signature → 401 + audit (via the narrowed `record_unauthenticated_audit_event`). **M15:** rate-limited after the HMAC check → 429. Public path by design (Paystack is the caller). |
| `app/api/cron/subscriptions/route.ts` | GET | `Authorization: Bearer $CRON_SECRET`, `timingSafeEqual`. **Fails closed** — 503 if `CRON_SECRET` is unset. Public path (Vercel Cron is the caller). |
| `app/(app)/reports/export/route.ts` | GET | `getCurrentOrganizationId()` → 401; then `recordReportExport()` + `runStandardReport()` both call `requirePermission('reports.export' / 'reports.view')`; `AuthorizationError` → 403. |
| `app/auth/confirm/route.ts` | GET | Verifies the Supabase OTP `token_hash` from the email link — this is what *establishes* the session, so no prior guard is possible or wanted. Calls `ensureOrganizationBootstrapped()`. |
| `app/api/health/route.ts` | GET | ⚪ None — liveness probe. Returns commit SHA + Supabase reachability only; no secret, no tenant data. |

## Legend

- ✅ — permission-guarded (directly or via a delegate `mutations.ts` /
  `SECURITY DEFINER` RPC)
- ✅* — guarded, but the guard is non-obvious (in an RPC, self-scoped, or
  documented as belt-and-suspenders over an RLS boundary)
- ⚪ — deliberately public / pre-auth, with the reason stated

No unguarded, non-public mutation remains after Milestone 15.
