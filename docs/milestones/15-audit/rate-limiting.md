# Rate limiting

Milestone 15 Acceptance Criterion: "Rate limiting is in place on login,
webhook, and checkout endpoints."

## Why Postgres-backed

The app runs on Vercel serverless. Instances share no memory, so a
per-instance counter is a limit divided by however many instances happen to
be warm — not a limit. A shared store is required, and the project's
$0–$10/month constraint rules out Redis or a paid WAF. The `rate_limits`
table (`supabase/migrations/20260826090000`) is the only shared state
available at that price. It generalizes the existing `login_attempts` idiom
(`20260822093200`) without replacing it — see that migration's header for why
the two stay separate.

## The primitive

`consume_rate_limit(bucket, identifier, limit, window_seconds) → boolean`
(`supabase/migrations/20260826090100`). One atomic check-and-insert:

- Counts rows in `(bucket, identifier)` within the trailing window.
- At or over `limit` → returns `false` **without inserting** (a hammering
  client cannot push its own window forward and lock itself out
  indefinitely).
- Under `limit` → inserts one row, returns `true`.
- ~1 call in 100 also prunes rows older than a day — no cron dependency.

`rate_limit_count(...)` is a read-only companion for tests and this document.
Neither is reachable except through the SECURITY DEFINER grant; the table has
RLS on with zero policies and zero table grants.

The TypeScript wrapper is `lib/rate-limit/limiter.ts` (`consumeRateLimit`,
`RateLimitError`). Thresholds live in `lib/rate-limit/config.ts` — one table,
the single tuning point.

## The buckets

| Bucket | Where it hooks | Key | Limit / window | On trip |
|--------|---------------|-----|----------------|---------|
| `login` | `app/(auth)/actions.ts` → `signIn`, beside the per-identifier throttle | client IP | 20 / 15 min | error in the existing `AuthActionState`, same message as the throttle |
| `login_reset` | `app/(auth)/actions.ts` → `requestPasswordReset` | client IP | 5 / 60 min | the **identical** generic notice, send skipped |
| `webhook` | `app/api/webhooks/paystack/route.ts`, **after** HMAC verify | client IP | 120 / 60 s | HTTP 429 + `Retry-After: 60` |
| `checkout` | `lib/sales/mutations.ts` → `createSale`, **after** `requirePermission` | authenticated **user id** | 120 / 60 s | `RateLimitError`, surfaced by `checkoutAction`'s existing error path |
| `unauth_audit` | inside `record_unauthenticated_audit_event()` (SQL) | client IP | 30 / 60 s | RPC raises `53400`, swallowed by the TS wrapper |

### Why these choices

**`login` sits beside — not instead of — the per-identifier throttle**
(`check_login_throttle`, 5 failures / 15 min per email). That one stops
password-guessing against one account. This one stops password *spraying*:
one source, one common password, many accounts — which the per-identifier
check cannot see because no single account accumulates failures. Same message
on trip on purpose: telling an attacker which limit they hit tells them how
the defence is shaped.

**`login_reset` is tighter because each call sends an email** — an inbox-bomb
and Resend-quota-burn vector otherwise. It returns the same "if an account
exists..." notice as success and simply skips sending, so the limit never
becomes the account-existence oracle that notice exists to deny.

**`webhook` is applied after the HMAC check.** An unsigned flood is already
rejected having cost only an HMAC, so limiting before verification would just
add a DB round trip to the cheapest branch. What this bucket governs is a
legitimately-signed retry storm — Paystack redelivering faster than
settlement keeps up — and 429 + `Retry-After` is the right answer. The
`webhook_events` idempotency ledger makes the delayed retry safe.

**`checkout` keys on the cashier's user id, never IP or org.** A busy
supermarket runs many tills behind one NAT'd public IP; an IP key would let
one fast lane throttle the whole store, an org key would be worse. 120
sales/minute per cashier is ~2/sec sustained — unreachable by a human,
trivially hit by a runaway client loop or a replayed token. Placed after
`requirePermission('sales.create')` so unauthenticated or unauthorized noise
never consumes a slot.

**`unauth_audit` is enforced in SQL, not TypeScript.** The allow-list in
`record_unauthenticated_audit_event()` stops forgery; only the limit stops
flooding, and a TS check would be bypassed by calling the RPC directly with
the public anon key — the exact threat.

## Fail-open — a deliberate decision

If the `consume_rate_limit` RPC itself errors (not "limit reached" — an
actual failure to evaluate), every call site **allows the request** and logs
`rate_limit.unavailable_failing_open` at error level.

The trade is explicit: a limiter outage degrades to no limiting, rather than
to an outage of the thing being limited. A till must not stop selling because
the limiter is unreachable; Paystack retries a dropped webhook regardless;
and for sign-in the per-identifier throttle remains the real brute-force
control, so failing open never leaves login unprotected. Every fail-open logs
loudly so it shows as an incident, not a silently disabled control.

## Tuning

Change the numbers in `lib/rate-limit/config.ts`. No migration needed — the
SQL takes `limit` / `window_seconds` as arguments. The one exception is
`unauth_audit`, whose numbers are also hardcoded in
`20260826090200_create_auth_audit_event_function.sql` (the RPC must hold
regardless of any caller); keep the two in sync.

## Tests

`tests/integration/hardening.test.ts` — each bucket permits exactly its limit
then refuses; a refused call does not extend the window; buckets and
identifiers are independent; rows outside the window are ignored;
`rate_limits` is unreachable through the Data API; the unauthenticated audit
RPC trips at 30.
