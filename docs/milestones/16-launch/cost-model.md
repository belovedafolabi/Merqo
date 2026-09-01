# Cost Model — One Client Deployment

Milestone 16's acceptance criterion: total recurring infrastructure cost for a
single client deployment is confirmed to be within the **$0–$10/month**
target. This document is that confirmation, plus the specific paid upgrade and
the usage threshold that would force it — measured where possible, not
guessed.

## Itemized recurring cost (per client, per month)

| Item | Tier | Cost |
|------|------|------|
| Supabase project | Free | $0 |
| Vercel deployment | Hobby | $0 |
| UptimeRobot monitor | Free | $0 |
| Resend (email) | Free | $0 — **platform-shared**, not per client |
| Paystack | — | transaction fees on subscription revenue only; not infrastructure |
| Custom domain | — | ~$1/mo amortized (annual registration) |
| **Total** | | **$0–$1 / client / month** |

This is inside the $0–$10 target — **with one acknowledged exception, below.**

## The open exception: Vercel Hobby prohibits commercial use

`README.md` has flagged this since before Milestone 16: **Vercel's Hobby tier
prohibits commercial use.** Merqo is a commercial subscription product, so a
real paying client cannot legitimately run on Hobby. Vercel Pro is **$20/month
per member**, which alone exceeds the $10 target.

Milestone 16 **does not resolve this and does not amend the $10 target.** It
is recorded as an explicit open risk on `launch-checklist.md` §7, for a
decision at launch time: accept Pro and revise the target upward, or move to a
different host. Nothing in the `docs/` corpus is changed to pretend the $10
number still holds for a commercial deployment.

## Free-tier limits and the upgrade each forces

| Free-tier limit | Threshold that forces the upgrade | Upgrade | Cost |
|-----------------|-----------------------------------|---------|------|
| **Supabase database: 500 MB** | Measured at ~4.2 KB per sale (heap + indexes + toast across `sales`, `sale_items`, `payments`, `inventory_movements` — see `performance-review.md`). 500 MB ≈ **~120,000 lifetime sales** before the base schema and other tables are subtracted; realistically plan for the upgrade around **60,000–80,000 sales**. A busy single-branch supermarket at ~200 sales/day reaches that in under a year. | Supabase Pro (8 GB, + 7-day PITR) | **$25/mo** |
| **Supabase project auto-pause** after 7 days idle | Any client with quiet stretches (seasonal, closed for a period). | *Mitigated for free* by the 5-minute UptimeRobot ping on `/api/health`. | $0 |
| **Supabase direct connections / pooler** | Free tier's connection ceiling is comfortably above a handful of concurrent tills; it becomes real only with many simultaneous POS sessions per client. | Supabase Pro | $25/mo |
| **Vercel serverless function duration: 10 s** | Measured: a 30-line-cart `create_sale()` takes **~22 ms** of database time (`pos-write-performance.test.ts`) — a ~450× margin. Reports are all ≤ 102 ms. Not a near-term constraint. | Vercel Pro (60 s) | included in the $20 Pro |
| **Vercel Hobby: no commercial use** | Immediately, on the first paying client. | Vercel Pro | **$20/mo** |
| **Resend: 3,000 emails/month, 100/day** — **fleet-wide**, not per client | Total notification volume across *all* clients (expiry warnings, lock notices, employee invites). At a handful of clients this is not close; it scales with client count, not per-client activity. | Resend paid | ~$20/mo |

## Realistic commercial launch cost

For the first real paying client, the minimum legitimate stack is:

| Item | Cost |
|------|------|
| Vercel Pro (commercial use) | $20/mo |
| Supabase Free → Pro (once sales volume or data-loss tolerance requires it; may start Free) | $0 rising to $25/mo |
| Everything else | ~$1/mo |
| **At launch** | **~$21/mo**, rising to **~$46/mo** once Supabase Pro is needed |

Both figures are above the $10 target. This is the decision `launch-checklist.md`
§7 puts in front of the owner, not one this milestone makes.

## Revisiting `docs/TAS.md` §45's free-tier limits

Milestone 16's Implementation Notes ask for this explicitly, "since this is
the point where those limits stop being theoretical." Done above: the two
that bite first are **Vercel's commercial-use term** (immediately, a
licensing wall not a technical one) and **Supabase's 500 MB** (a technical
wall, ~1 year of single-branch volume). Vercel's 10 s function limit and
Supabase's connection pool are not near-term constraints at the measured
numbers.
