# Merqo Milestone Roadmap

This directory is the implementation-ready roadmap for the Merqo platform, reconciled from the 33-document design corpus in `docs/`. Before reading any milestone, read [`DECISIONS_AND_CONFLICTS.md`](DECISIONS_AND_CONFLICTS.md) — it resolves five conflicts found across those documents (backend framework, inventory ownership, product/business-unit cardinality, stock transfer scope, and Super Admin scope) and every milestone below assumes those resolutions as given.

**Repository state at the time this roadmap was written:** greenfield — zero application code, zero config, zero CI/CD, zero tests, zero git commits. Every milestone is scoped as "build from zero."

**Reconciled architecture baseline** (used consistently across all 16 milestones): Next.js (App Router) + React + TypeScript + Tailwind + shadcn/ui, server logic via Next.js Server Actions/Route Handlers directly against Supabase (Postgres + Auth + Storage) — no standalone Express service. Resend for email, Paystack for subscription billing only, GitHub + GitHub Actions + pnpm, deployed on Vercel. Independent deployment (own Supabase project + own Vercel deployment) per client. Offline capability is fully and permanently excluded.

## Milestone list

| # | Milestone | One-line description |
|---|---|---|
| [01](01-project-foundation-and-cicd.md) | Project Foundation & CI/CD | Repo, Next.js skeleton, GitHub Actions pipeline, branch protection, env/secret conventions, test frameworks wired — Day One CI/CD/testing. |
| [02](02-database-and-core-domain-foundation.md) | Database & Core Domain Foundation | Organization → Branch → Business Unit → Business Type → Capability schema; RBAC/audit table skeletons; locks in branch-owned inventory and one-product-per-business-unit at the schema level. |
| [03](03-authentication-and-rbac-foundation.md) | Authentication & RBAC Foundation | Supabase Auth, sessions, populated Roles/Permissions/Scope, server-side authorization guard, first real RLS policies, audit-log write path. |
| [04](04-design-system-and-app-shell.md) | Design System & Application Shell | Design tokens, shadcn/ui, branding-override mechanism, distinct Admin Dashboard vs. POS shells, responsive rules. |
| [05](05-business-structure-and-onboarding.md) | Business Structure Management & Onboarding | Onboarding wizard, Branch/Business Unit CRUD, capability overrides, per-Business-Unit POS configuration (tax/service-charge/discount policy). |
| [06](06-product-catalog-and-pricing.md) | Product Catalog & Pricing Engine | Products/categories/variants scoped to one Business Unit, branch-level pricing with history, transaction-time price-snapshot mechanism. |
| [07](07-inventory-and-stock-management.md) | Inventory & Stock Management | Branch-owned balance/movement ledger, adjustments, batch/expiry, simple branch-to-branch transfers. |
| [08](08-pos-transaction-engine.md) | POS Transaction Engine (Sales, Checkout, Returns & Refunds) | Cart/checkout, atomic + concurrency-safe + idempotent sale creation, returns and refunds on the same engine. |
| [09](09-customer-store-credit-and-layaway.md) | Customer Management, Store Credit & Layaway | Unified customer domain: business-wide customer records, ledger-based store credit and layaway. |
| [10](10-reporting-analytics-and-accounting.md) | Reporting, Analytics & Accounting | Standard report catalog, custom report builder + export, intermediate accounting calculations — all on normalized transactional data. |
| [11](11-administration-employees-and-branding.md) | Administration, Employees & Branding | Employee directory/invite/deactivate, custom-role builder UI, branding and receipt-template editors. |
| [12](12-notifications-and-communications.md) | Notifications & Communications | Event-driven in-app + email (Resend) notification model, shared `NotificationService`/`EmailService` layering. |
| [13](13-subscription-billing-and-platform-admin.md) | Subscription, Billing & Platform Administration | Org-level subscription, Super Admin pricing config, Paystack checkout + backend-verified webhook, expiry warning/lock. |
| [14](14-hardware-integration-and-pos-ux.md) | Hardware Integration & POS UX Refinement | Barcode scanner input, browser-based receipt printing, customer-facing display, tablet/phone optimization, performance tuning. |
| [15](15-security-qa-and-hardening.md) | Security, QA & Production Hardening | Cross-cutting RLS/authorization audit, secrets/rate-limiting review, full regression/E2E suite, cross-browser/hardware regression. |
| [16](16-production-readiness-and-launch.md) | Production Readiness & Launch | Performance/DB optimization, monitoring/backup/DR, per-client deployment automation, launch checklist. |

## Dependency graph

```text
01 Project Foundation & CI/CD
   │
   ▼
02 Database & Core Domain Foundation
   │
   ▼
03 Authentication & RBAC Foundation
   │
   ├─────────────────────────────┐
   ▼                             ▼
04 Design System & App Shell     12 Notifications & Communications
   │                             (needs 03; feeds 07's low-stock alerts,
   ▼                              11's invitations, 13's expiry warnings,
05 Business Structure &           15's security alerts)
   Onboarding
   (needs 02, 03, 04)
   │
   ▼
06 Product Catalog & Pricing
   │
   ▼
07 Inventory & Stock Management ──────► (low-stock condition feeds 12)
   │
   ▼
08 POS Transaction Engine
   (Sales, Checkout, Returns & Refunds)
   │
   ├─────────────────────────────┐
   ▼                             ▼
09 Customer Mgmt, Store        14 Hardware Integration &
   Credit & Layaway                POS UX Refinement
   │
   ▼
10 Reporting, Analytics & Accounting
   │
   ▼
11 Administration, Employees & Branding
   (needs 03, 05; coordinates with 12 for invite emails)
   │
   ▼
13 Subscription, Billing & Platform Administration
   (needs 03, 11, 12)
   │
   ▼
15 Security, QA & Production Hardening
   (audits everything from 05–14)
   │
   ▼
16 Production Readiness & Launch
```

Notes on the graph:

- **04** and **12** both only require **03**, so they can run in parallel with each other and, to a degree, with early work on **05** — but **05** itself needs **04** for its screens.
- **12** (Notifications) is a cross-cutting service consumed by **07** (low-stock), **11** (invitations), **13** (expiry warnings), and **15** (security alerts) — it must exist before those consumers need it, but its own build only depends on **03**. It is sequenced after **09** in the numbered list for narrative flow (grouped near the domains that most obviously produce events) but has no hard dependency on 05–09; a team could pull it earlier if resourcing allows.
- **14** (Hardware) depends only on **08**, not on 09–13 — it could run in parallel with 09–13 if resourced separately.
- **15** and **16** are strictly last: 15 audits the assembled system from 05–14, and 16 assumes 15's hardening is complete.

## CI/CD progression

CI/CD is established in full (install → lint → typecheck → test → build, branch protection, Vercel preview deployments) in **Milestone 01** — not deferred. Every subsequent milestone extends the same pipeline with its own tests; none introduces a parallel or separate pipeline:

- **01:** Pipeline created. Smoke tests only.
- **02:** Migration-apply + schema-constraint tests added.
- **03:** RLS/authorization test suite added (the template every later milestone's own RLS tests follow).
- **04:** Accessibility (axe-core) and responsive-render checks added.
- **05–07:** Domain integration/authorization/concurrency tests added per milestone.
- **08:** Concurrency + idempotency tests added — the highest-scrutiny suite in the pipeline.
- **09–12:** Further domain integration/authorization tests, plus (12) Resend sandbox integration tests.
- **13:** Paystack sandbox integration tests, webhook signature/idempotency tests, a scheduled job for expiry evaluation.
- **14:** Cross-device/responsive/performance-benchmark tests added.
- **15:** Full cross-milestone regression/E2E suite and cross-browser matrix become a required (or nightly) pipeline stage.
- **16:** Deployment-verification smoke test added; pipeline runtime reviewed/trimmed if needed.

## Testing progression

- **Unit:** starts at 01 (smoke), becomes substantive from 03 (permission resolution) onward — every milestone from 02 forward ships unit tests for its own pure logic (pricing resolution in 06, calculation functions in 08, ledger math in 09, accounting math in 10).
- **Integration/API:** starts at 02 (migrations against a real DB) and is present in every milestone from 03 onward, always against a real disposable Supabase/Postgres instance, never fully mocked for anything touching RLS or transactions.
- **Authorization/RLS:** established as a first-class, dedicated suite in 03; every milestone from 03 onward adds its own table/action coverage to that same discipline; re-swept holistically in 15.
- **Concurrency:** first appears in 07 (inventory), is the centerpiece of 08 (sales), reappears in 09 (store credit), and is stress-tested at higher load in 15.
- **E2E/browser/responsive:** basic smoke E2E from 01; meaningful flows from 05 onward; hardware-adjacent and device-responsive testing concentrated in 14; full cross-browser, cross-milestone regression suite in 15.
- **Hardware-related:** concentrated in 14 (scanner input simulation, print-stylesheet rendering, tablet/phone Playwright checks), regression-checked again in 15.
- **Regression:** every milestone's test suite accumulates in CI (per the CI/CD progression above) so earlier coverage keeps running against later changes throughout, with 15 adding an explicit cross-milestone regression sweep on top.
- Per `docs/PRD.md` §44 / Stage 32 §32.12 (both the earliest and latest documents in the corpus, in full agreement): no dedicated "POS transaction test" *category* is required as a separate bucket, but the underlying transaction/business logic receives full unit + integration + concurrency coverage inside Milestone 08 itself — honored exactly as written.

## Security progression

Security is not a late milestone — it is established starting at 02–03 and reinforced by every milestone after:

- **02:** RLS enabled (even if unpopulated) on every table the moment it's created — never a window where a table exists unprotected.
- **03:** Server-side authorization guard, real RLS policies, audit-log foundation, login throttling — the security backbone every later milestone's own Security Requirements section builds on.
- **04:** Storage access scoping for branding assets; accessibility/contrast guardrails.
- **05–11:** Each milestone's own permission checks, RLS policies, and audit-log entries for its domain — cost price visibility (06), transfer authorization (07), refund authorization (08), store-credit/layaway authorization (09), report/export scoping (10), self-elevation prevention in the role builder (11).
- **08:** Concurrency + idempotency protection, server-side re-derivation of all financial calculations (never trusting client-supplied totals) — the highest-stakes security surface in the product.
- **12–13:** Notification content scoping (12); Paystack webhook signature verification and backend payment re-verification, subscription-lock enforcement exclusively bypassable by Super Admin (13).
- **14:** Customer-facing display surface reviewed to ensure it exposes nothing beyond cart/total.
- **15:** Full, dedicated cross-cutting security audit — RLS sweep, authorization sweep, secrets/rate-limiting review — verifying the cumulative result of every milestone above, not introducing security for the first time.
- **16:** Backup/restore and per-client provisioning reviewed to ensure no secret/credential reuse across independent client deployments.

## Cross-cutting concerns summary

- **Immutability & audit:** every milestone from 03 onward that writes a sensitive/transactional record (sales, refunds, store-credit, layaway, subscription payments, employee/role changes) does so append-only, with a corresponding audit-log entry via the single shared helper established in Milestone 03.
- **Configuration over hard-coding:** the capability engine (02), business-type-as-template pattern (02, 05), and role-as-configuration pattern (03, 11) are the mechanisms that keep this a genuinely *Dynamic* POS — no milestone should introduce a business-type or role-name conditional in application code.
- **Cost discipline:** every milestone's Technical Requirements/Implementation Notes explicitly avoid Redis, Elasticsearch, Kubernetes, microservices, paid queues, and paid observability/monitoring unless a concrete need is demonstrated — the $0–$10/month target is treated as a real constraint throughout, not just in Milestone 01 and 16.
- **Offline capability:** appears nowhere in this roadmap, by design, per the project's explicit and repeated decision to remove it entirely.
