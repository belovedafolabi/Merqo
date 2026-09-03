# Milestone 17 — Post-Launch Enhancements

## Status

In progress, one PR per part, in the order **C → D → A → B**. Part C is sequenced first because
it is the only actual security defect, it is the most isolated, and it changes the shared
Playwright auth fixture — doing that once up front gives the other three a stable auth baseline.

| Part | Status |
|------|--------|
| A — Sales Insights | Planned |
| B — Business-Type Refinements | Planned |
| C — Session Lifecycle & Security | **Shipped** — see "Part C as built" below |
| D — UX Fixes & Tour Navigation | Planned |

### Part C as built — deviations from the spec below

The spec was written before some of the code it describes was read closely. Where the two
disagree, the list here is what shipped:

- **`scope: 'local'`, not the default, on the proxy's timeout sign-out.** `signOut()` defaults to
  `global`, which revokes the refresh token everywhere — a laptop left idle overnight would have
  silently signed the user out of the till they were standing at. An idle timeout is a statement
  about one device. Deactivation (Milestone 11) keeps its global sign-out, where that is the point.
- **The expired response carries the auth-cookie deletions.** `signOut()` writes its cookie
  removals through the `@supabase/ssr` `setAll` hook onto the `response` object, which the timeout
  path then replaces with a redirect/401. Without copying them across, the browser kept a valid
  auth cookie and the next request re-bootstrapped a fresh window — making the timeout something
  the user could navigate straight past.
- **Session-cookie writes are deferred to just before the final `return`.** The deactivation and
  subscription RPCs can trigger a token refresh, and `setAll` rebuilds `response` from scratch when
  they do; cookies written earlier were dropped roughly once per `jwt_expiry`.
- **No `auth.session_timeout` audit row** — a structured log only. `recordAuditEvent` needs an
  `organizationId`, and `proxy.ts` has no grants loaded; fetching them would mean a second RPC on a
  session it is about to kill. The two revoke events (`auth.sessions_revoked_password_change`,
  `auth.sessions_revoked_manual`) are audited normally, plus `auth.password_changed`.
- **The timeout check is gated on `!isAuthScreen`, not `!isPublicPath()`.** `isPublicPath()` returns
  true for every `/api/` path, so reusing it would have left the exact bypass this part exists to
  close. Expired sessions on `/api/*` get a 401 JSON body, not a 302 to an HTML login page.
- **A self-service `changePassword` action was added** (the spec only implied one). Without it,
  "force-logout on password change" would only ever fire on the emailed-reset flow. It re-verifies
  the current password rather than trusting the session.
- **`components/ui/checkbox.tsx` does not exist**; "remember me" uses the existing `Switch`, which
  is how every other boolean in this codebase submits (`value="on"` into FormData).
- **Settings → Account is a new per-user screen** (`requireUser()`, not `requirePermission`),
  alongside Notifications — the codebase had no personal account screen at all.
- **E2E backdates cookies rather than shortening the window via env.** The env overrides exist and
  are unit-tested, but they are inlined at build time and Playwright builds once per run, so a
  window short enough to expire inside one test would expire every other authenticated spec too.
  The spec file is pinned to a single project: it is the only one that signs in for real, and
  fanning it across viewports would push one IP past the app's own 20-per-15-minute login limit.

## How This Document Differs From Milestones 01–16

Milestones 01–16 are the reconciled greenfield roadmap (see [`README.md`](README.md) and
[`DECISIONS_AND_CONFLICTS.md`](DECISIONS_AND_CONFLICTS.md)). Milestone 17 is the first
**post-launch** milestone: the product is live, sales are recording, and these are
independently-shippable enhancements and fixes requested by the product owner after launch.
They share one milestone number for bookkeeping but have **no dependency on each other** and
can be built, reviewed, and merged in any order (or in parallel) as separate PRs. Parts A–C
are feature-sized; Part D is a batch of four small UX fixes that can share one PR or be split.

| Part | Enhancement | One-line description |
|------|-------------|----------------------|
| [A](#part-a--sales-insights-predictive-analysis-without-ml) | Sales Insights | A statistics-only "Insights" page: per-product demand forecasts (next day / 7 days / 30 days), restock suggestions, and slow-mover promo candidates. No ML, no new infrastructure. |
| [B](#part-b--business-type-refinements-lighter-touch) | Business-Type Refinements | Make each of the 13 business types feel purpose-built through **configuration only** — per-type terminology presets, dashboard/report presets, richer onboarding defaults, and a handful of new à-la-carte capability flags. |
| [C](#part-c--session-lifecycle--security) | Session Lifecycle & Security | Replace the never-expiring session with a 24-hour rolling inactivity timeout, a 30-day absolute cap, a "remember me" choice at sign-in, force-logout of other sessions on password change, and a "sign out everywhere" control. |
| [D](#part-d--ux-fixes--tour-navigation) | UX Fixes & Tour Navigation | Four small items: (D1) loading/settle toasts on every async action; (D2) wire up the dead POS menu button as a slide-out sheet; (D3) make customer-activity rows clickable through to the receipt / layaway; (D4) add a clickable step list to the product-tour popover. |

### Shared constraints (apply to all parts)

- **Cost discipline (roadmap §"Cross-cutting concerns"):** no Redis, no Elasticsearch, no
  analytics database, no paid BI/charting SaaS, no new paid service of any kind. Everything
  runs on the existing Postgres + Next.js + Vercel stack.
- **Configuration over hard-coding:** no `business_type === 'restaurant'` branches anywhere in
  application code — the same rule Milestone 02/05 established. Business-type behaviour is
  driven by seeded reference tables, exactly like `business_type_capabilities` and
  `business_type_category_suggestions` already are.
- **Per-client deployment model:** each client has its own Supabase project and its own Vercel
  deployment. Any `supabase/config.toml` change (Part C) must be applied to every client
  project as part of provisioning, and **production migrations are applied manually** — every
  part's rollout notes must call this out.
- **Migration hygiene (learned the hard way):** every new table needs an explicit
  `grant … to authenticated` in the same migration as its RLS policies, or authenticated
  reads get `42501 permission denied` and CI's migration job won't catch it. Any file that
  becomes a client bundle entry must not transitively import `lib/supabase/server`; keep pure
  types/Zod schemas in a `types.ts`/`schemas.ts`. Run `pnpm build` (not just typecheck)
  before pushing.
- **Workflow:** one branch + one PR per part, CI logs read in full (not just the green tick),
  squash-merge once clean.

---

## Part A — Sales Insights (Predictive Analysis Without ML)

### Objective

Ship a dedicated **Insights** page (`/insights`) that turns the sales history already sitting
in `public.sales` / `public.sale_items` into three concrete, explainable outputs per business
unit:

1. **Demand forecast per product** for three horizons — next day, next 7 days, next 30 days —
   each with a plain-language "why" and a confidence signal.
2. **Restock suggestions** — which products will run out soon at current velocity, and roughly
   how much to order.
3. **Slow-mover promo candidates** — products with stock on hand that haven't sold recently,
   ranked by tied-up capital, presented as a *recommendation to run a promotion* (the merchant
   sets the coupon up themselves in Settings → Coupons; Insights does not create discounts).

Explicitly **not** machine learning: no training, no model artefacts, no Python service, no
vector anything. Every number is a SQL aggregate plus arithmetic that a shop owner could
re-derive by hand.

### Why This Part Exists

`docs/TAS.md` §39 anticipates an "AI-driven insights" feature and Milestone 10 deliberately
kept its reporting data model normalized so that "a future AI feature could query it directly
without a rework" — while listing AI insights as explicitly out of scope. This part fills that
gap with the non-AI version: the same business value (tell the owner what to restock and what
to discount) using descriptive statistics and naive seasonal forecasting, which is well within
what a single-shop dataset can support honestly.

### Dependencies

- Milestone 06 (products, variants, categories, `unit_cost` on `sale_items`).
- Milestone 07 (`inventory_balances` for on-hand quantity).
- Milestone 08 (`sales`, `sale_items` — the source data).
- Milestone 10 (money semantics: `net_sales = Σ(subtotal − discount_amount)`; the Insights
  page must not contradict the Reports module for the same period).

### Scope

- **Compute model: on-demand + short-lived cache table.** A page load computes insights at
  request time via a Postgres function, writes the result to a `sales_insights_cache` row keyed
  by `(business_unit_id, horizon)` with a `computed_at`, and serves subsequent loads straight
  from cache until the row is older than a staleness window (default **6 hours**), at which
  point the next load recomputes. No `pg_cron` job. (Rationale: matches `docs/TAS.md` §34 —
  "introduce materialized views / aggregation tables only if profiling later demonstrates a
  real need". If the page is ever slow at scale, a nightly refresh can be layered on without
  changing the read path.)
- **Forecast method (locked):**
  - `velocity_7d`  = Σ`sale_items.quantity` for the product over the trailing 7 days ÷ 7
  - `velocity_28d` = Σ`sale_items.quantity` over the trailing 28 days ÷ 28
  - `base_velocity` = `0.6 × velocity_7d + 0.4 × velocity_28d` (recent-weighted)
  - `dow_factor[weekday]` = (avg units sold on that weekday over the trailing ~8 weeks) ÷
    (overall daily average), clamped to `[0.5, 2.0]`
  - `forecast_next_day`  = `base_velocity × dow_factor[tomorrow's weekday]`
  - `forecast_next_7d`   = `base_velocity × Σ dow_factor` over the next 7 weekdays
  - `forecast_next_30d`  = `base_velocity × 30` (day-of-week effects wash out over a month)
  - `trend` = sign of `(velocity_7d − velocity_28d) / velocity_28d` → `"rising" | "falling" | "steady"` (dead-band ±10%)
  - **Confidence gate:** `LOW` if the product has fewer than 14 distinct days with a sale in
    the trailing 28 days, or fewer than 20 units sold in that window; otherwise `OK`. A `LOW`
    product shows "Not enough history yet" instead of a hard forecast number.
- **Restock suggestion (locked):**
  - `days_of_cover` = `current_on_hand ÷ base_velocity` (∞ when `base_velocity = 0`)
  - `suggested_order_qty` = `ceil(base_velocity × lead_days) − current_on_hand` (floored at 0),
    where `lead_days` is an org-level setting, default **14**
  - A product is flagged for restock when `days_of_cover < reorder_threshold_days` (org-level
    setting, default **7**) and it isn't archived.
- **Slow-mover candidate (locked):** zero units sold in the trailing 30 days **and**
  `current_on_hand > 0` **and** product not archived. Ranked by `current_on_hand × unit_cost`
  (capital tied up). Each row links to Settings → Coupons with the product name pre-filled in
  a note — it does **not** create a coupon.
- **"Why" strings:** templated server-side from the same numbers, e.g.
  *"Sells ~4/day; Fridays run about 1.6×. ~11 days of stock left."*
- **Insights page** at `/insights`, in the `(app)` route group, with three sections
  (Forecast, Restock, Slow movers), a business-unit switcher (reusing the existing one), and a
  horizon toggle for the forecast section. Charts reuse the existing Recharts setup from the
  dashboard.
- **New permission** `insights.view`, seeded and granted to Owner / Branch Manager by default,
  following Milestone 10's `reports.view` pattern.

### Out of Scope

- Any ML / statistical-model training, external ML API, or "AI" labelling.
- Automatic coupon or price changes (recommendation only).
- Cross-business-unit or cross-branch aggregate forecasting (v1 is per business unit; the page
  respects the same branch/BU scoping as Reports).
- Forecasting anything other than unit demand — no revenue forecast, no cash-flow projection,
  no staffing suggestions (possible future parts).
- Category-level or supplier-level rollups (future).
- Export of insights (Reports already owns export; revisit if asked).

### Technical Approach

- **`compute_sales_insights(p_business_unit_id uuid)` — `SECURITY DEFINER`, `set search_path = public`.**
  Computes all three horizons plus restock and slow-mover lists in one call and `upsert`s the
  three `sales_insights_cache` rows. `SECURITY DEFINER` (like `create_sale()` bumping
  `coupons.redemption_count`) so the cache write isn't blocked by RLS; the function itself
  filters strictly to the passed business unit and its organization. Narrow `grant execute … to
  authenticated`; `revoke … from public`.
- **`getSalesInsights(businessUnitId, horizon)` Server Action / query** in `lib/insights/`:
  permission-check `insights.view` via the Milestone 03 guard → read the cache row → if missing
  or `computed_at` older than the staleness window, call `compute_sales_insights` then re-read
  → return typed payload.
- Pure types and the payload Zod schema live in `lib/insights/types.ts` (no server imports) so
  the page's client components can import them safely (client-bundle `next/headers` trap).
- Reuse `inventory_balances` for on-hand; reuse `sale_items.unit_cost` (added in
  `20260823140600`) for the capital-tied-up ranking.
- No new npm dependency.

### Database Changes

- **New table `public.sales_insights_cache`:**
  `id uuid pk`, `organization_id uuid not null`, `branch_id uuid`, `business_unit_id uuid not null`,
  `horizon text not null check (horizon in ('next_day','next_7d','next_30d'))`,
  `payload jsonb not null`, `computed_at timestamptz not null default now()`,
  `unique (business_unit_id, horizon)`.
  RLS enabled; `grant select on public.sales_insights_cache to authenticated` in the same
  migration; SELECT policy scoped to the caller's organization (mirrors existing tenant-data
  policies). No INSERT/UPDATE/DELETE grant to `authenticated` — only `compute_sales_insights`
  writes it.
- **New settings columns** (org-level, on `organizations` or the existing org-settings table if
  one exists — confirm during implementation): `insights_lead_days int not null default 14`,
  `insights_reorder_threshold_days int not null default 7`.
- **New permission row** `insights.view` in the permissions seed; role-grant rows for Owner and
  Branch Manager.
- Indexes: verify `sale_items` join path to `sales.created_at` / `sales.business_unit_id` is
  covered — `sales_branch_id_idx (branch_id, created_at desc)` and `sale_items_product_id_idx`
  exist; add `sale_items (product_id, created_at)` or a `sales (business_unit_id, created_at)`
  index only if `EXPLAIN` on the compute function shows a seq scan on realistic volume.

### Backend / API Changes

- `compute_sales_insights` function migration (+ its grant/revoke).
- `lib/insights/queries.ts` (`getSalesInsights`), `lib/insights/types.ts`,
  `lib/insights/why.ts` (the templated explanation strings).
- Settings action to update `insights_lead_days` / `insights_reorder_threshold_days`
  (permission-gated, audited).

### Frontend Changes

- `/insights` route in `(app)`: three sections, BU switcher, horizon toggle, per-product rows
  with forecast number (or "not enough history"), trend chip, "why" line, and — in the Restock
  and Slow-mover sections — a suggested quantity / a "Set up a promo" link to
  `/settings/coupons`.
- Nav entry for Insights, shown only when the user has `insights.view`.
- A small "Recomputed X min ago" caption sourced from `computed_at`.
- Empty state for a business unit with no sales history at all.

### Security Requirements

- `insights.view` enforced server-side (Milestone 03 guard) **and** by RLS on
  `sales_insights_cache` scoped to the caller's organization — same two-boundary pattern as
  Reports.
- `compute_sales_insights` is `SECURITY DEFINER` and therefore must hard-filter every query to
  `p_business_unit_id` and its parent organization; it takes no free-form input, no dynamic
  SQL, and returns nothing that `reports.view` protects beyond what the caller could already
  see for their own branch.
- The cache row's `payload` must never include cost/margin figures for a user who lacks
  cost-price visibility (Milestone 06 rule) — if cost visibility is role-gated, compute two
  payload shapes or omit the capital-tied-up figure for non-privileged callers.

### Testing Requirements

- **Unit:** the forecast/restock/slow-mover formulas against fixed seeded sales scenarios
  (steady seller, spiky weekend seller, dying product, brand-new product with 3 days of data →
  must return `LOW` confidence).
- **Integration:** `compute_sales_insights` writes exactly three cache rows; a second call
  within the staleness window does not recompute; a call after `computed_at` is backdated does.
- **Authorization:** a user without `insights.view` gets nothing from `getSalesInsights` and
  cannot read `sales_insights_cache` directly; a user in branch A cannot obtain branch B's
  insights.
- **Reconciliation:** Insights' trailing-28-day unit totals match the Sales report for the
  same period and business unit.
- **E2E:** the Insights page renders all three sections for a seeded business unit and the
  "Set up a promo" link lands on Settings → Coupons.

### Observability

- Structured log on every `compute_sales_insights` call: business unit, row counts, wall-clock
  duration — an early warning if the query slows down before real data volume forces a nightly
  job.

### Deliverables

- `/insights` page with Forecast, Restock, and Slow-mover sections.
- `compute_sales_insights` function + `sales_insights_cache` table + `insights.view` permission.
- Org settings for lead time and reorder threshold.

### Acceptance Criteria

- [ ] The Insights page shows a per-product forecast for next day / 7 days / 30 days, each with
      a "why" line, for a business unit with sufficient history.
- [ ] Products with thin history show "Not enough history yet", never a fabricated number.
- [ ] The Restock section lists products below the cover threshold with a sane suggested order
      quantity.
- [ ] The Slow-mover section lists stocked-but-unsold products ranked by capital tied up, each
      linking to Settings → Coupons; no coupon is ever created automatically.
- [ ] Repeat page loads within 6 hours serve from cache; the first load after that recomputes.
- [ ] Insights unit totals reconcile with the Sales report for the same period.
- [ ] `insights.view` gates the page, the nav entry, the query, and direct table reads.

### Definition of Done

All acceptance criteria pass, `EXPLAIN` on `compute_sales_insights` against the seeded dataset
shows no unindexed seq scan on `sales`/`sale_items`, no `business_type`-conditional or ML
dependency was introduced, and `pnpm build` is clean.

### Implementation Notes

- Keep the "why" strings server-side and templated — never assemble them in the client from raw
  numbers, so wording stays consistent and translatable later.
- If cost-price visibility turns out to be role-gated, decide early whether to compute a
  reduced payload or gate the whole Slow-mover ranking; don't leak `unit_cost` into a JSON blob
  a cashier can read.
- The staleness window (6h) and the two org settings should be constants/columns, not magic
  numbers sprinkled through SQL.

### Risks

- **Honesty risk:** naive seasonal forecasting on a young or spiky dataset can look
  authoritative and be wrong. The confidence gate is the mitigation — err toward "not enough
  history yet" and tune the thresholds up if early feedback says the numbers feel shaky.
- **Cache staleness confusion:** a merchant who just made a big sale and sees an unchanged
  forecast. The "Recomputed X min ago" caption plus a manual "Refresh now" affordance
  (permission-gated, rate-limited) mitigates this without a cron job.

### Future Considerations

- Nightly `pg_cron` refresh if the page gets slow at scale (read path already cache-based, so
  this is additive).
- Revenue and cash-flow projections; staffing hints from hour-of-day patterns; category and
  supplier rollups; "frequently bought together" via plain co-occurrence counts.
- A one-click "create promo from this suggestion" once the coupon engine supports
  product-targeted codes (it currently doesn't).

---

## Part B — Business-Type Refinements (Lighter-Touch)

### Objective

Make each of the 13 seeded business types feel purpose-built **without building new modules**,
using four configuration mechanisms:

1. **Per-type terminology presets** — built-in only, not owner-editable in v1. A "Sale" reads
   as a "Bill" for a restaurant, a "Ticket" for a salon/barber, an "Order" for a wholesaler,
   etc., across POS, receipts, reports, and nav labels.
2. **Per-type dashboard & report presets** — which stat tiles / `dashboard_widgets` and which
   standard reports surface first for a newly-onboarded business of that type.
3. **Richer per-type onboarding defaults** — extend the existing
   `business_type_category_suggestions` and `units_of_measure` seeds so every type lands with
   sensible starting categories and units instead of near-empty lists.
4. **A small set of new à-la-carte capability flags** so the capability catalogue covers more
   of the 13 verticals. Every capability stays independently toggleable regardless of business
   type (the existing `business_unit_capabilities` override mechanism).

### Why This Part Exists

The platform's whole thesis is "one configurable POS, not many apps" (Stage 29). Today the
configuration surface is thin: 7 capabilities, a 13×7 default matrix, category suggestions, and
units of measure. A restaurant and a hardware store currently differ almost only by which of 7
switches are on. This part widens the configuration surface — still configuration, still no
behavioural code branches — so the verticals feel distinct on day one.

### Dependencies

- Milestone 02 (`business_types`, `capabilities`, `business_type_capabilities`).
- Milestone 05 (onboarding wizard, capability override UI).
- Milestone 10 (report catalog) and the post-launch `dashboard_widgets` table
  (`20260903090400`) for the preset targets.
- Milestone 11 (branding/receipt editors) — the pattern to imitate *structurally* even though
  terminology stays non-editable in v1.

### Scope

- **New reference table `public.business_type_terminology`:** `(business_type_id, term_key,
  singular, plural)` — seeded for all 13 types for a fixed set of `term_key`s
  (`sale`, `customer`, `product`, `cart`, `receipt`, `catalog`, at minimum). A missing row
  falls back to the generic default. Platform-managed, readable by any authenticated user
  (same policy shape as `business_type_category_suggestions`).
- **A `useTerminology()` / `getTerminology()` resolver** that loads the current business unit's
  type terminology once per request and exposes `t('sale', { plural })` style lookups. All
  user-facing "Sale"/"Customer"/etc. strings in POS, receipts, reports, and nav route through
  it. No literal vertical names anywhere in code.
- **New reference table `public.business_type_presets`:** `(business_type_id, preset_kind,
  payload jsonb)` where `preset_kind ∈ ('dashboard_widgets', 'pinned_reports')`. Consumed
  **only at onboarding** to seed a new business unit's `dashboard_widgets` rows and a
  `pinned_reports` list; the owner can change everything afterward. Not a runtime gate.
- **Expanded onboarding seed data:** fill `business_type_category_suggestions` and
  `units_of_measure` associations for every one of the 13 types (several are currently sparse),
  purely additive seed rows.
- **New capabilities** (added to the `capabilities` catalogue + the `business_type_capabilities`
  default matrix, all still individually overridable per business unit):
  - `services` — sell non-stock service line items (salon, barber, hotel, general services).
    Behaviourally this is "a product with `track_inventory = false`"; the capability just
    surfaces the right UI affordances and hides stock columns.
  - `quick_sale` — a fast keypad / no-scan checkout mode (bakery, convenience, general retail).
  - `weighed_items` — allow fractional-quantity line items priced per unit weight (bakery,
    supermarket deli, wholesale). `sale_items.quantity` is already `numeric(14,3)`, so this is
    a UI/validation capability, not a schema change.
  - Final list to be confirmed against the 13 types during implementation; the mechanism is the
    deliverable, the exact rows are data.
- **Onboarding & Business Unit settings UI:** show the resolved terminology preview and the new
  capability toggles alongside the existing ones (Milestone 05's capability review step).

### Out of Scope

- Owner-editable terminology (v1 is built-in presets only — revisit if asked).
- Anything on Stage 29's exclusion list: tables / table layouts / reservations / dine-in /
  delivery / KDS / recipes / ingredients / modifiers / meal combos; prescription management /
  patient records / drug-interaction / insurance / controlled-drug tracking; loyalty points /
  membership tiers / customer groups / preferences; hotel property management; procurement /
  supplier management.
- **Tips** — explicitly dropped from this part by the product owner. `service_charge` already
  exists as an all-types capability and is untouched.
- Per-type pricing rules, per-type tax behaviour (one configurable rate stays the model,
  Stage 29.11), per-type permission sets.
- Localisation / i18n framework (the terminology resolver is deliberately a narrow lookup, not
  a general translation system — though it should be shaped so a future i18n layer could back
  it).

### Technical Approach

- Two new seeded reference tables + expanded seed rows; **zero** behavioural branching in
  application code — a code review checklist item for the PR is "grep for any business-type
  slug used in an `if`/`switch`".
- The terminology resolver is a per-request cached read (like `getCurrentUserContext`),
  returning a plain map; components call a tiny `t()` helper. Server components read it
  directly; client components receive the resolved map via context (same shape as
  `permissions-context.tsx`).
- New capabilities are catalogue rows + default-matrix rows + UI wiring that reads
  `business_unit_capabilities` exactly like the existing 7 do.
- `business_type_presets` is read by the onboarding completion action only; it writes normal
  `dashboard_widgets` rows and a `pinned_reports` array, after which it's never consulted
  again for that business unit.

### Database Changes

- `public.business_type_terminology` — new reference table, RLS + `grant select … to
  authenticated`, `using (true)` select policy, seed rows for all 13 types.
- `public.business_type_presets` — new reference table, same policy shape, seed rows.
- `capabilities` — new rows (`services`, `quick_sale`, `weighed_items`, …).
- `business_type_capabilities` — new default-matrix rows so the matrix stays complete
  (13 × N).
- `business_type_category_suggestions` / `units_of_measure` — additional seed rows only.
- Possibly `pinned_reports jsonb` (or a join table) on the per-business-unit settings table for
  the report preset target — confirm against the existing schema during implementation.

### Backend / API Changes

- `lib/terminology/` — `getTerminology(businessUnitId)`, `types.ts`, the `t()` helper.
- Onboarding completion action extended to read `business_type_presets` and seed
  `dashboard_widgets` + `pinned_reports`.
- Capability-list constants extended; no new mutation surface beyond what Milestone 05 already
  has for capability overrides.

### Frontend Changes

- Route the existing hard-coded "Sale"/"Customer"/"Product"/"Cart"/"Receipt" strings in POS,
  receipt templates, report headings, and nav through `t()`.
- Onboarding: terminology preview on the business-type step; new capability toggles on the
  capability-review step.
- Business Unit settings: same new toggles; a read-only "Terminology (from your business type)"
  panel.
- Dashboard / Reports: honour the seeded presets for a freshly-onboarded business unit;
  existing businesses are unaffected (no migration of their current layout).

### Security Requirements

- The new reference tables are platform data, readable by any authenticated user, writable
  only by migration/seed — no tenant can edit another tenant's (or the platform's) terminology
  or presets.
- New capabilities go through the same permission checks as their nearest existing analogue
  (`services` ↔ `products`, `weighed_items` ↔ POS discount-style validation) — a new capability
  must not become an unguarded write path.
- No capability flag may be togglable by a role that couldn't already change
  `business_unit_capabilities` (Milestone 05: Owner/Admin-level, audited).

### Testing Requirements

- **Unit:** `getTerminology` returns the seeded term for a type and the generic fallback for a
  type with no row / an unknown `term_key`.
- **Integration:** onboarding a business unit of each type seeds the expected
  `dashboard_widgets` and category/unit suggestions; changing type later does **not**
  retroactively rewrite an existing unit's layout.
- **Capability tests:** each new capability defaults per the matrix for each business type and
  can be overridden per business unit and persists (extends Milestone 05's capability-default
  tests).
- **Guard-rail test / lint:** a test (or CI grep) that fails if a business-type slug appears in
  a conditional in `app/` or `lib/`.
- **E2E:** onboard as a "Restaurant" → POS says "Bill", receipts say "Bill"; onboard as a
  "Beauty Salon / Barber" with `services` on → can add a service line with no stock.

### Observability

- Structured log of the business type chosen at onboarding and which presets were applied —
  feeds a future view of which verticals actually sign up.

### Deliverables

- `business_type_terminology` + `business_type_presets` tables, seeded for all 13 types.
- Terminology resolver wired through POS / receipts / reports / nav.
- `services`, `quick_sale`, `weighed_items` (and any confirmed additions) as overridable
  capabilities.
- Expanded category / unit onboarding seeds for every type.

### Acceptance Criteria

- [ ] Each of the 13 business types shows its own terminology in POS, receipts, reports, and
      nav, with a clean generic fallback.
- [ ] Onboarding a new business unit applies that type's dashboard/report presets and richer
      category/unit suggestions; existing units are untouched.
- [ ] The new capabilities default per business type, are individually overridable per business
      unit regardless of type, and are audited on change.
- [ ] No business-type slug appears in any application-code conditional (verified by test/grep).
- [ ] Nothing on the Stage 29 exclusion list was built; tips were not added.

### Definition of Done

All acceptance criteria pass, the guard-rail test is green in CI, seed data covers all 13
types for every new reference table, and `pnpm build` is clean.

### Implementation Notes

- Do the terminology wiring as a mechanical sweep in one PR section — find every user-facing
  literal, route it through `t()`, keep the diff boring and reviewable.
- Keep `term_key`s few and generic; resist adding a key per screen. Six well-chosen keys cover
  most of the perceived difference.
- Presets are a one-time onboarding convenience, not a feature toggle — make that
  unmistakeable in the code comments so nobody later turns them into a runtime gate.

### Risks

- **Scope creep toward real modules:** "purpose-built" invites requests for tables, KDS,
  prescriptions. The Stage 29 exclusion list is the contract — every request against it is a
  separate future milestone, not a bug in this one.
- **Terminology sweep misses spots:** a stray "Sale" in an error message or a PDF. Mitigated by
  the mechanical-sweep approach + an E2E check on the two most visible verticals.

### Future Considerations

- Owner-editable terminology overrides (Milestone 11 editor pattern).
- A proper i18n layer behind the same `t()` call site.
- More capabilities as real vertical demand appears; per-type default report *content*, not
  just which reports are pinned.

---

## Part C — Session Lifecycle & Security

### Objective

Replace today's effectively-immortal session with a bounded one:

- **24-hour rolling inactivity timeout** — a full day with no activity signs the user out; any
  activity resets the clock, so a user who works daily is never interrupted.
- **30-day absolute cap** — even a continuously-active session ends after 30 days and must
  re-authenticate.
- **"Remember me" at sign-in** — unticked (default): a short session that ends on browser close
  with an ~8–12h hard cap; ticked: the 24h-rolling / 30-day-cap session above. Never a
  forever session either way.
- **Force-logout of all other sessions on password change** (self-service change and
  post-reset).
- **"Sign out everywhere"** control in account settings.

Out of scope: per-device session-management UI, MFA/2FA (both noted as future).

### Why This Part Exists — and is it a security issue?

Yes — a real, moderate one. Current state:

- `supabase/config.toml`: `jwt_expiry = 3600`, `enable_refresh_token_rotation = true`,
  `refresh_token_reuse_interval = 10`, and the `[auth.sessions]` block **commented out** — so
  there is no inactivity timeout and no absolute cap.
- `proxy.ts` calls `supabase.auth.getUser()` on every matched request, which silently refreshes
  the rotating refresh token. With no `timebox` / `inactivity_timeout`, that refresh chain
  never ends.
- Net effect: a session persists until the user explicitly clicks "Log out". On a POS where
  **staff have their own logins**, that means a departed employee's laptop or a lost phone
  stays authenticated indefinitely, and a stolen refresh token is valid until someone notices.

Refresh-token rotation with reuse detection is already on, which limits the damage from a
*copied* token, but it does nothing about the "device just stays logged in" problem. Bounding
the session is the standard fix and is low-risk to implement here because the enforcement point
(`proxy.ts`) already exists.

### Dependencies

- Milestone 03 (`proxy.ts` session refresh + route gating, `(auth)/actions.ts`,
  `lib/auth/context.ts`, login throttle, audit helper).
- Milestone 11 (deactivation already does a global sign-out via `proxy.ts` +
  `user_is_active()` — Part C must not regress that path).
- Milestone 13 (subscription lock keeps a live session on purpose — the inactivity logic must
  not sign a locked-out Owner out mid-payment; treat `/subscription-locked` like the existing
  `LOCK_EXEMPT_PATHS`).

### Scope

- **Supabase project-level backstop (`config.toml`, all client projects):** enable
  `[auth.sessions]` with `timebox = "720h"` (30 days) and `inactivity_timeout = "24h"`. This
  is the global outer limit for every user; it is **not** per-login configurable, which is why
  the "remember me" distinction is enforced in the app layer below.
- **App-level session policy (the "remember me" mechanism), in `proxy.ts`:**
  - On successful sign-in, the `signIn` action sets two `httpOnly`, `Secure`, `SameSite=Lax`
    cookies: `merqo_sess_policy` (`"short" | "long"`, from the checkbox) and `merqo_sess_start`
    (ISO timestamp).
  - `proxy.ts`, on every non-prefetch authenticated request (it already computes `isPrefetch`):
    - reads `merqo_last_seen`; if `now − last_seen > idleLimit(policy)` → `supabase.auth.signOut()`
      + redirect to `/sign-in?reason=timeout`.
    - `idleLimit` = **12h** for `short`, **24h** for `long`.
    - also enforces an app-side absolute cap from `merqo_sess_start`: **12h** for `short`
      (covers "ends on browser close" deterministically even if the browser is left open),
      **30 days** for `long` (redundant with `timebox` but keeps the message consistent).
    - otherwise refreshes `merqo_last_seen = now`.
  - For `short`, the session cookies are additionally written **without a `maxAge`** (session
    cookies) so a browser restart drops them and the next request is unauthenticated.
- **Force-logout on password change:** in `confirmPasswordReset` (and any future self-service
  password-change action), after `updateUser({ password })` succeeds, call
  `supabase.auth.signOut({ scope: 'others' })` so every other session's refresh token is
  revoked while the current one survives. Audit event `auth.sessions_revoked_password_change`.
- **"Sign out everywhere":** an account-settings action calling `signOut({ scope: 'others' })`
  (keeps the current device) with an audit event; a second "…including this device" option
  calls `scope: 'global'`.
- **Sign-in form:** add the "Remember me for 30 days" checkbox; default unchecked; label copy
  makes the trade-off explicit.
- **`/sign-in` messaging:** handle `reason=timeout` (and keep existing `reason=deactivated`,
  `reason=subscription_expired`) with a friendly "You were signed out after a period of
  inactivity" notice.

### Out of Scope

- Per-device / active-session list UI with individual revoke (future — `scope: 'others'` is the
  v1 blunt instrument).
- MFA / TOTP / passkeys (`[auth.mfa]` stays as-is; noted as future).
- "Trust this device" / step-up auth.
- Changing `jwt_expiry` (staying at 3600) or the rotation/reuse settings.
- Server-side session storage or a custom session table — everything rides on Supabase Auth +
  the three `merqo_sess_*` cookies.

### Technical Approach

- All timing logic lives in `proxy.ts` behind a small `lib/auth/session-policy.ts` (pure
  functions: `idleLimitMs(policy)`, `absoluteCapMs(policy)`, `isExpired(...)`) — unit-testable
  without a request context, no server imports, so it's safe if it's ever pulled into a client
  bundle.
- Cookies are `httpOnly` so client JS can't extend a session by rewriting `merqo_last_seen`;
  tampering only ever lets a user shorten their own session or forces a re-login, so the risk
  of a signed cookie is not worth the complexity — but the values are format-validated in
  `proxy.ts` and a malformed cookie is treated as "expired".
- `proxy.ts` already has the prefetch guard, the public-path list, and the lock-exempt list —
  the new check slots in beside the existing `user && !isPublicPath && !isPrefetch` block and
  must run **before** the deactivation / subscription RPCs (cheaper, and no point RPC-ing for a
  session we're about to kill).
- `signOut({ scope: 'others' })` is a supported Supabase Auth call; verify the installed
  `@supabase/supabase-js` version supports the `scope` option (it has since v2.x) during
  implementation.

### Config / Infrastructure Changes

- `supabase/config.toml`: uncomment and set `[auth.sessions] timebox` / `inactivity_timeout`.
- **Provisioning doc update:** `docs/milestones/16-launch/client-provisioning.md` must gain a
  step to set the same two values in every client's hosted Supabase Auth settings (they are
  project settings, not shipped by migrations).
- **Production rollout note:** this changes session behaviour for **all currently-logged-in
  users** on deploy — everyone effectively gets the new limits from their next request.
  Communicate it; consider deploying after hours.

### Database Changes

- None required. (Audit events use the existing `audit_logs` + `recordAuditEvent()` helper.)

### Backend / API Changes

- `lib/auth/session-policy.ts` (pure timing logic).
- `proxy.ts`: cookie read/refresh + expiry enforcement.
- `(auth)/actions.ts`: `signIn` sets policy cookies from the checkbox; `confirmPasswordReset`
  adds `signOut({ scope: 'others' })` + audit.
- `app/(app)/settings/…`: "Sign out everywhere" action(s) + audit.

### Frontend Changes

- "Remember me for 30 days" checkbox on `/sign-in` (unchecked by default, explicit label).
- `reason=timeout` notice on `/sign-in`.
- "Sign out of all other devices" (and "…including this one") buttons in account settings, with
  a confirm step.

### Security Requirements

- The inactivity check must run on every authenticated non-prefetch request and must not be
  bypassable by hitting an API route directly — confirm `proxy.ts`'s matcher covers `/api/*`
  app routes that carry a session (it currently treats `/api/` as public for *gating* but
  still runs session refresh; the timeout check must apply there too for any authenticated API
  route).
- `merqo_sess_*` cookies: `httpOnly`, `Secure` (prod), `SameSite=Lax`, no value that's useful
  to an attacker (policy string + timestamps only — no user id, no token).
- Password change / reset must revoke other sessions **server-side** (`scope: 'others'`), not
  merely clear a cookie — a stolen refresh token on another device has to stop working.
- Deactivation (Milestone 11) and subscription lock (Milestone 13) paths must be re-tested:
  deactivation still does a global sign-out; a locked Owner on `/subscription-locked` is not
  signed out by the inactivity check.
- Login throttle / rate-limit on `/sign-in` is unchanged and still applies to the extra
  re-logins this introduces.

### Testing Requirements

- **Unit (`session-policy.ts`):** idle limit and absolute cap per policy; boundary cases
  (exactly at limit, malformed timestamp → expired); `long` vs `short` divergence.
- **Integration / proxy:** a request with `last_seen` 25h ago and `policy=long` → signed out +
  `reason=timeout`; 23h ago → allowed, `last_seen` refreshed; `policy=short` with `sess_start`
  13h ago → signed out regardless of `last_seen`; prefetch request does **not** refresh
  `last_seen`.
- **Auth flows:** ticking "remember me" yields `policy=long` cookies; unticked yields `short`
  session-cookies; `confirmPasswordReset` revokes a second session (assert the other session's
  next request is unauthenticated) but keeps the current one.
- **Regression:** deactivated user still force-signed-out immediately; locked Owner still
  reaches `/subscription-locked` and stays signed in there past the idle window while on that
  page.
- **E2E:** sign in without remember-me → restart browser context → landing on a protected page
  redirects to `/sign-in`. Sign in with remember-me → still signed in after a simulated
  browser restart.
- **CI:** Playwright suite runs with a shortened idle window via env override so the timeout
  path is exercised without a 24h wait.

### Observability

- Audit events: `auth.session_timeout` (with `policy`), `auth.sessions_revoked_password_change`,
  `auth.sessions_revoked_manual`. Structured logs already exist for sign-in/sign-out.
- A structured log line whenever `proxy.ts` force-signs-out on timeout, with the policy and how
  long idle — to spot a mis-tuned limit early.

### Deliverables

- Bounded sessions: 24h rolling idle + 30d cap (long), browser-session + ~12h cap (short).
- "Remember me" checkbox driving the two policies.
- Force-logout of other sessions on password change.
- "Sign out everywhere" in account settings.
- `config.toml` change + provisioning-doc step.

### Acceptance Criteria

- [ ] A signed-in user idle for over 24h (remember-me on) is signed out and sees the inactivity
      notice; activity within 24h keeps the session alive indefinitely up to 30 days.
- [ ] A session hits a hard stop at 30 days (remember-me on) and requires re-authentication.
- [ ] Without "remember me", the session ends on browser restart and cannot exceed ~12h.
- [ ] Changing the password (self-service or post-reset) signs out every other device while
      keeping the current one.
- [ ] "Sign out everywhere" revokes other sessions from account settings.
- [ ] Deactivation and subscription-lock behaviour are unchanged.
- [ ] The inactivity check cannot be bypassed by calling an authenticated API route directly.

### Definition of Done

All acceptance criteria pass, the Playwright suite exercises the timeout path via a shortened
window, `client-provisioning.md` documents the two Supabase Auth settings, the production
rollout note is written, and `pnpm build` is clean.

### Implementation Notes

- Put every duration in `session-policy.ts` as a named constant with an env override for tests;
  no bare `86400000` in `proxy.ts`.
- Order the `proxy.ts` checks: session refresh → **timeout check** → deactivation RPC →
  subscription RPC. Killing the session first saves two RPCs.
- Keep the cookie parsing defensive — any unparseable `merqo_sess_*` value means "expired,
  re-login", never "assume long".

### Risks

- **Everyone gets logged out around the same time post-deploy** if many sessions are already
  old. Mitigation: the rolling window starts from first request after deploy (there's no stored
  `last_seen` yet, so treat "no cookie" as "just started"), so the mass logout is 24h/12h after
  deploy, not instant — still worth an announcement.
- **Clock skew / DST** on `last_seen` math — use UTC epoch milliseconds throughout, never local
  time or `date` arithmetic.
- **API routes** that carry a session but sit under the `/api/` public-gating branch could be a
  bypass — explicitly audited in Testing Requirements.

### Future Considerations

- Per-device active-session list with individual revoke (needs a session registry — Supabase
  exposes `auth.admin.listUserSessions` via the service role; revisit when there's a real ask).
- MFA/TOTP (`[auth.mfa.totp] enroll_enabled` is `false` today).
- "Trust this device for 30 days" as a step-up pattern once MFA exists.
- Configurable idle/cap durations per client deployment (constants → org or deployment
  settings).

---

## Part D — UX Fixes & Tour Navigation

### Objective

Four small, unrelated UX items batched into one part. Each is independently shippable; they can
share a single PR or be split. None needs a migration or a new dependency.

| # | Item | Type |
|---|------|------|
| D1 | Loading/settle toasts on every async action | Consistency sweep |
| D2 | POS menu button is dead — wire it to a slide-out sheet | Bug fix + small feature |
| D3 | Customer-activity rows should be clickable through to the receipt / layaway | Small feature |
| D4 | Product-tour popover needs a clickable step list to jump around | Small feature |

---

### D1 — Toasts for every async action

**Problem.** Feedback for background work is inconsistent. Some actions toast (sign-in,
uploads, checkout, exports, POS search); many don't (processing a return, generating a report
PDF, and most CRUD server actions), so the app can feel frozen while work runs.

**Decision (product owner): blanket coverage.** Every user-initiated async operation gets a
loading toast and a settle (success / error) toast — **even when the triggering control is
already disabled or spinning**. This deliberately overrides the current guidance in
`lib/toast.ts` ("not for every server action… only work not already obvious from a disabled
button"); that comment must be updated so the codebase and its docs agree.

**Scope.**
- Route every mutation Server Action, export, print-prep, file upload, and multi-step client
  operation through the existing helpers:
  - `notify(promise, { loading, success, error })` where there's a clear completion in the
    same tick.
  - `notifyPending(label)` / `usePendingToast(active, label, delayMs)` where completion is a
    redirect or a `useActionState` `pending` flag.
- Keep the existing `delayMs` anti-flash guard (300ms, from the design guidelines) as the
  default so a sub-300ms action never flashes a toast — "blanket" means *every action is
  wired*, not *every action always shows a toast even when instant*.
- **One explicit carve-out:** debounced type-ahead search (`pos-search`, filter bars) does
  **not** toast on each keystroke pause — only on an explicit submit / apply. Called out here
  so a reviewer doesn't flag it as a miss.
- Standardise the copy: present-tense gerund for loading ("Processing return…", "Preparing
  PDF…", "Saving product…"), past-tense for success ("Return processed", "Product saved"),
  and a human error ("Couldn't process the return — try again").

**Files.**
- `lib/toast.ts` — update the doc comment to the blanket policy; no API change expected.
- A pass over `app/(app)/**/actions.ts`, `app/(pos)/**`, `components/**` dialogs and forms.
  The likely current gaps: returns/refunds (`app/(app)/sales`, POS returns flow), report PDF
  export (`components/reports/*`), receipt preparation, expenses, layaway payments,
  store-credit issue/adjust, employee invite/deactivate, role save, business-structure CRUD.
- Consider a tiny wrapper (`withToast(actionFn, messages)`) to make the call sites uniform and
  hard to forget.

**Testing.**
- Unit: `withToast` / helper wrappers call `toast.loading` then resolve to success/error
  correctly; the `delayMs` guard suppresses a toast for a promise that resolves in <300ms.
- E2E: processing a return shows "Processing return…" then "Return processed"; a report PDF
  export shows a preparing toast that resolves when the download/preview opens.
- E2E (negative): a forced server error surfaces the error toast, not a silent no-op.

**Acceptance criteria.**
- [ ] Every mutation Server Action and export/print/upload path shows a loading toast and a
      success-or-error toast.
- [ ] Fast (<300ms) actions do not flash a toast.
- [ ] Debounced search does not toast per keystroke.
- [ ] `lib/toast.ts`'s doc comment reflects the blanket policy.

---

### D2 — Wire up the POS menu button

**Problem.** `components/pos/pos-header.tsx` renders
`<Button variant="ghost" size="icon-touch" aria-label="Menu"><Menu /></Button>` with **no
`onClick` and no handler** — it does nothing. The POS shell (`app/(pos)/layout.tsx`) has no
drawer to toggle.

**Decision.** The button opens a **slide-out sheet** (Radix `Sheet`, already in
`components/ui`). Contents:
- **Switch business unit** — reuse `components/shell/business-unit-switcher.tsx` (or its POS
  equivalent).
- **Returns** — link to `/pos/returns`.
- **Held sales** — surface/return to held-sale tabs (`components/pos/held-sales-tabs.tsx`).
- **Open customer display** — reuse `OpenCustomerDisplayButton`.
- **Back to Admin dashboard** — link to `/dashboard` (permission-aware: only if the user has
  admin access; a pure Cashier may not).
- **Sign out** — the existing `signOut` action.

**Responsive behaviour.**
- The menu button is always visible in the POS header.
- On screens `< sm`, the sheet is the home for the actions the compact header hides today
  (Returns, Walk-in customer / customer selection, customer display).
- On `≥ sm`, where those actions are already in the header, the sheet is lighter — business-unit
  switch, back to Admin, sign out, held sales.

**Files.**
- `components/pos/pos-header.tsx` — add open state + `Sheet`; move the hidden-below-`sm`
  actions into the sheet's mobile section rather than duplicating markup.
- Possibly a new `components/pos/pos-menu-sheet.tsx` to keep the header lean.

**Testing.**
- Unit/RTL: clicking the menu opens the sheet; each item is present per the viewer's
  permissions (Cashier sees no "Back to Admin dashboard").
- E2E (mobile viewport): the menu exposes Returns and customer display that the header drops;
  tapping Returns navigates to `/pos/returns`.
- E2E: "Sign out" from the sheet ends the session and lands on `/sign-in`.
- A11y: the button keeps `aria-label="Menu"`, `aria-expanded` reflects sheet state, focus moves
  into the sheet and is restored on close.

**Acceptance criteria.**
- [ ] The POS menu button opens a sheet with business-unit switch, Returns, Held sales,
      customer display, back-to-Admin (permission-gated), and Sign out.
- [ ] On mobile the sheet carries the actions the header hides; nothing the user needs is
      unreachable on a 375px screen.
- [ ] Keyboard and screen-reader operable; `aria-expanded` correct.

---

### D3 — Clickable customer-activity rows

**Problem.** On the customer detail screen (`components/customers/customer-detail-view.tsx`),
the "Transaction history" table lists sales, returns, store-credit entries, and layaways but
none of the rows are clickable — a `sale` row can't be opened to see what was actually bought.

**Decision.** Make the whole row clickable:
- `kind: 'sale'` → open the receipt at `/receipts/preview?saleId=<row.id>` in the same popup
  window the Sales list uses (`openReceipt()` in `components/sales/sales-view.tsx` — extract
  it to `lib/sales/` so both call sites share it).
- `kind: 'return'` → open the **original sale's** receipt. The activity query currently sets a
  return entry's `id` to the return id; it must also carry the parent `saleId` so the row can
  link to `/receipts/preview?saleId=<parentSaleId>` (the receipt view already reflects
  returns against the sale).
- `kind: 'layaway'` → navigate to the layaway detail page (`/layaways/<row.id>`).
- `kind: 'store_credit'` → **not** clickable (the store-credit ledger tab beside it is the
  detail view; a ledger row has no deeper screen).

**Files.**
- `lib/customers/queries.ts` — `getCustomerTransactionHistory`: add `saleId` (and for
  layaways, confirm `id` is the layaway id) to `CustomerActivityEntry`; for `return` rows,
  select the parent `sale_id` from the `sales`/`returns` join.
- `lib/customers/queries.ts` type `CustomerActivityEntry` — add the optional `saleId?: string`
  (or a discriminated `href`/`onOpen` field computed server-side).
- `components/customers/customer-detail-view.tsx` — make the `DataTable` rows interactive:
  a clickable row (button semantics, `role="link"` or an actual anchor for layaway; a button
  that calls the popup opener for sale/return). Non-clickable kinds render as plain rows.
- `components/sales/sales-view.tsx` — import the shared `openReceipt` instead of its local
  copy.

**Testing.**
- Unit: the query returns `saleId` on `sale` and `return` entries; a `return` entry's `saleId`
  is the parent sale, not the return id.
- RTL: a `sale` row is a button labelled e.g. "View receipt for sale on <date>"; a
  `store_credit` row is not interactive.
- E2E: on a customer with a sale, clicking the activity row opens the receipt popup showing the
  right line items; clicking a layaway row lands on that layaway's page.
- A11y: interactive rows are reachable by keyboard with a clear accessible name; the whole-row
  hit area doesn't trap or double-fire.

**Acceptance criteria.**
- [ ] Clicking a `sale` activity row opens that sale's receipt.
- [ ] Clicking a `return` row opens the original sale's receipt.
- [ ] Clicking a `layaway` row opens the layaway detail page.
- [ ] `store_credit` rows are not clickable.
- [ ] The Sales list and the customer activity table share one `openReceipt` implementation.

---

### D4 — Clickable step list in the product-tour popover

**Problem.** The product tour (`components/tour/product-tour.tsx`, driver.js) is strictly
linear — Next / Back only. A user who just wants the explanation for one section has to click
through everything to reach it.

**Decision.** Keep the linear flow and the auto-start-once behaviour exactly as they are. Add,
**inside the driver.js popover**, a clickable list (or dropdown) of all steps in the current
track; clicking one jumps straight there via `driver().moveTo(index)` and the tour continues
linearly from that point. First-run auto-start is unchanged — the list is simply present.

**Approach.**
- driver.js v1 exposes `onPopoverRender(popover, { config, state })` and imperative
  `moveTo(stepIndex)` / `getActiveIndex()`. Use `onPopoverRender` to inject a compact
  "Jump to" control (a `<details>`/disclosure or a small scrollable list) into the popover
  footer, built from the same `steps` array the component already computes (post-filter, so it
  only lists steps whose target exists on the page).
- Each entry shows the step `title`; the active step is marked. Clicking calls `d.moveTo(i)`.
- Keep it keyboard-navigable and small — it must not dominate the popover. On mobile
  (`isMobile`), render it as a collapsed disclosure so the popover stays within a 375px width.
- No change to `steps.ts` content or ordering; no change to `tour_completed_at` handling or
  `markDone()`.

**Files.**
- `components/tour/product-tour.tsx` — add `onPopoverRender` with the injected list; wire
  clicks to `d.moveTo`. Keep the injected DOM cleaned up by driver.js's own popover teardown.
- Possibly `components/tour/tour-step-list.tsx` for the injected control if it grows past a few
  lines.
- `app/globals.css` (or the existing `.merqo-tour` popover styles) — styling for the list.

**Testing.**
- RTL/unit: given a filtered step list, the injected control renders one entry per step with
  the active one marked; clicking entry N calls `moveTo(N)`.
- E2E: start the tour, open the jump list, click a later step → that element is spotlighted and
  Next continues from there; the tour still completes and sets `tour_completed_at`.
- E2E (mobile): the list renders collapsed and the popover doesn't overflow the viewport.
- Regression: auto-start-once for a new user still fires; a degenerate run (<2 steps) still
  doesn't burn the one-time flag.

**Acceptance criteria.**
- [ ] The tour popover shows a list of all steps in the current track.
- [ ] Clicking a step jumps to it; Next/Back then continue linearly from there.
- [ ] First-run auto-start, the "Take a tour" FAB, and one-time completion are unchanged.
- [ ] The list is keyboard-operable and doesn't overflow on a 375px screen.

---

### Part D — shared notes

- **No migration, no new npm dependency** for any of D1–D4 (D3 adds fields to an existing
  query's `select` and return type only).
- **Testing:** extends the existing Vitest + Playwright suites; no new CI infrastructure.
- **Definition of done for Part D:** all four items' acceptance criteria pass, `pnpm build` is
  clean, and `lib/toast.ts`'s doc comment matches the shipped D1 policy.
