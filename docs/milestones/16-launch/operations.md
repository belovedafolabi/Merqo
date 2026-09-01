# Operations — Monitoring & Incident Response

Where to look when a client's production deployment misbehaves. Everything
here stays within the $0–$10/month constraint: Supabase's and Vercel's own
dashboards, a free-tier uptime checker, and the structured logs Merqo already
emits.

## The three places to look

| Surface | What it shows | URL |
|---------|---------------|-----|
| **Vercel → the client's project → Logs** | Every `console.*` line from Server Actions and Route Handlers (Merqo routes all structured logs here), plus HTTP status and duration. Filter `level:error`. | vercel.com dashboard |
| **Vercel → Deployments / Cron** | Which build is live, deploy history, and the daily cron's last run + status. | same |
| **Supabase → the client's project → Database → Query Performance / Logs / Database Health** | Slow queries, connection count, disk usage, and Postgres logs. | supabase.com dashboard |

There is no external log aggregator. Milestone 16 confirmed this is
sufficient at MVP client scale — see "The logging spot-check" below.

## Symptom → destination

The `message` field of every log line is a dotted event name — grep for it in
Vercel logs.

| Symptom | Where | What to grep / look at |
|---------|-------|------------------------|
| Site returns 500s | Vercel → Logs, `level:error` | `route.render_error`, the failing route's path |
| **Every authenticated route shows "Something went wrong" right after a deploy** | `supabase migration list --linked` (or `--db-url`) against the client | The deployed code is ahead of the client's schema — a missing table/column/RPC throws in a layout and the error boundary takes over. Compare the local column with the remote column; if they differ, the migrations were never applied. Fix: back up, then `supabase db push --linked --include-seed` (seed too — the permission catalog drifts the same way), then `scripts/verify-client-db.sql`. Nothing in CI/CD applies prod migrations — this is checklist item 1.15, done by hand. |
| Sign-in failing for everyone | Vercel → Logs | `auth.supabase_not_configured` (env missing), `auth.organization_bootstrap_failed` |
| Sign-in failing / slow for some | Vercel → Logs | `auth.sign_in_throttled` (rate limiter), `auth.organization_bootstrap_deferred` |
| A sale wouldn't save | Vercel → Logs; then Supabase SQL: `select * from sales where idempotency_key = '<key>'` | `sale.rejected` — its `errcode` is the Postgres SQLSTATE: `P0001` insufficient stock, `P0002` product/BU mismatch, `P0004` bad quantity. `sale.created` confirms the ones that worked. |
| Barcode scans "not finding" products | Vercel → Logs | `pos.scan_no_match`, `pos.scan_rejected`, `products.barcode_lookup_miss` |
| Customer display not updating | Vercel → Logs | `pos.display_protocol_mismatch` |
| Reports slow or timing out | Vercel → Logs; Supabase → Query Performance | `report.executed.slow` (already emitted when a report exceeds its soft budget), `report.export_failed` |
| Subscription webhook not landing | Supabase SQL: `select * from webhook_events order by created_at desc limit 20`; Paystack dashboard → Webhook log | `paystack.webhook_rejected` (bad signature), `paystack.webhook_duplicate`, `paystack.webhook_ignored`, `paystack.webhook_verify_unavailable` |
| Daily subscription cron didn't run | Vercel → Cron | `subscription.cron_misconfigured` (CRON_SECRET unset → 503), `subscription.cron_unauthorized`, `subscription.cron_failed`; `subscription.cron_completed` is the success line |
| Expiry/lock emails not arriving | Resend dashboard → Logs | `email.send_failed`, `email.transport_fallback_log` / `email.sent_via_log` (Resend key unset → logged, not sent), `notification.email_failed` |
| Rate limiting misfiring | Supabase SQL: `select * from rate_limits order by window_start desc limit 50` | `rate_limit.tripped`, `rate_limit.unavailable_failing_open` (the limiter's backing table was unreachable and it let the request through) |
| Health check red | `GET https://<domain>/api/health` | `checks.supabase` = GoTrue `/auth/v1/health`; `checks.postgrest` = a real anon RPC round-trip (`check_login_throttle`) through PostgREST's schema cache. `health.auth_unreachable` / `health.postgrest_unreachable` in logs. |

### Worked example: a cashier reports "checkout is failing"

1. Vercel → Logs, grep `sale.rejected`. Suppose the line reads
   `{"errcode":"P0001","branchId":"…","itemCount":6}`.
2. `P0001` is `insufficient stock` (raised by `record_inventory_movement`,
   `20260823110400`). Not a bug — the cart has more units than the branch has
   on hand.
3. Supabase SQL: check `inventory_balances` for that branch/product. If the
   balance is wrong, look for a missing `record_inventory_movement` (a
   receiving that never happened) rather than a code fault.
4. If instead the errcode were absent/`null`, the failure is upstream of the
   RPC — check for a `route.render_error` or a thrown Zod error on the same
   request id.

## Uptime monitoring — free tier

**UptimeRobot free** (50 monitors, 5-minute interval). One monitor per client:

1. Sign in at uptimerobot.com → **Add New Monitor**.
2. Monitor Type: **HTTP(s)**.
3. URL: `https://<client-domain>/api/health`.
4. Monitoring interval: 5 minutes.
5. Under **Advanced → Keyword**: keyword type "exists", keyword
   `"status":"ok"` — so a `200` with a `degraded` body still alerts.
6. Alert contact: the platform owner's email. Confirm the address.
7. After creating it, **pause it once and confirm the down-alert email
   arrives**, then un-pause — an untested alert is not a working alert (this
   is a launch-checklist item).

*Alternative:* Better Stack free (10 monitors, 3-minute interval) — recorded
as the fallback if UptimeRobot's free tier changes.

**Rejected:** a GitHub Actions cron that curls each client. A monitor hosted
on a platform that may itself be degraded, with no reliable alert channel and
a schedule GitHub does not honour under load, is strictly worse than a
purpose-built free service.

### Side benefit: keeps a Free project awake

A Supabase Free project pauses after 7 days with no activity. A 5-minute
uptime ping on `/api/health` (which touches GoTrue and PostgREST) keeps a
quiet client's project from auto-pausing — for free.

## The logging spot-check (Milestone 16 requirement)

Milestone 16 asks that structured logging be "spot-checked, not just
assumed". It was, and it found a real gap: among ~40 distinct `logger.*`
event names, **there was no `sale.*` event of any kind.** The single most
important operation in the product — POS checkout — emitted nothing, so a
`create_sale()` failure surfaced only as a thrown error with no log line.

Fixed in `lib/sales/mutations.ts`: `sale.created` on success (`saleId`,
`branchId`, `businessUnitId`, `itemCount`, `total`) and `sale.rejected` on
failure (`branchId`, `businessUnitId`, `itemCount`, `errcode` — errcode only,
never cart contents or customer identity).

Kept honest by a test, not this document:
`tests/unit/logging-conventions.test.ts` re-derives every `logger.*` call
site from source on every run and asserts the dotted-event-name convention,
plus that `lib/sales/mutations.ts` still emits both `sale.*` events.

**Recorded, not fixed:** `redact()` in `lib/logger.ts` inspects only
top-level context keys — a secret nested inside an object value would pass
through. No current call site does that; deepening it now would be
speculative.
