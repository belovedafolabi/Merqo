# Merqo — Decisions & Conflicts Register

**Purpose:** `docs/` contains 33 markdown files produced across a long, iterative AI-assisted design conversation (labeled Stage 4 → Stage 32, plus pre-stage `PRD.md` / `TAS.md`, plus a mid-session consolidation `Functional_Specification.md`). Several architecturally significant questions were revisited multiple times, and some documents disagree with later ones — in one case (`Functional_Specification.md`) a single file disagrees with itself. This register is the single authoritative reconciliation of those conflicts, used consistently across every file in `docs/milestones/`.

Per the project brief: **where a conflict exists, the latest explicit project decision wins**, and outdated decisions must not be silently preserved. Timestamps and stage numbers track together chronologically across the corpus (confirmed by file-modification order), so "latest stage number" = "latest decision" except where a document is itself internally inconsistent.

---

## 1. Backend framework — Express is dropped; Next.js + Supabase is authoritative

**Conflict:** `PRD.md` (header) and `TAS.md` (header, §1–3, §45, §47) specify **"Supabase + ERN"** = React + Express + Node.js, with a full `server/modules/...` Express directory structure and an "Express API" box in the architecture diagram.

Starting at **Stage 17** (`Application_Architecture_and_System_Structure.md`, §17.2), the project explicitly reverses this:

> "Your original stack direction was: Supabase-ERN. If by ERN you mean: Express / React / Node — then adding Express creates another persistent application that has to be hosted... For this particular POS, that isn't necessary at the beginning... We should avoid introducing a traditional Express backend unless a concrete requirement emerges for one."

This is not a stray remark — it is reasoned explicitly from the $0–$10/month infrastructure constraint, and it sticks through every subsequent document: "Express" appears **zero times** in any of the 30 documents written after Stage 17, including the master `Functional_Specification.md`. The **final document in the entire corpus**, `Testing_CI_CD_Deployment_and_Release_Management.md` (Stage 32), confirms it as the terminal decision — its deployment diagram is `GitHub Actions → Vercel → Next.js Application → Supabase / Resend`, with pnpm standardized as the package manager and no Express/Node server anywhere.

**Resolution:** The roadmap adopts **Next.js (App Router) + React + TypeScript, server logic via Next.js Server Actions and Route Handlers, against Supabase directly** — no standalone Express service. "ERN" is treated as the historical label for "React on a Node runtime," which Next.js satisfies without the cost/complexity of a second persistent service. `PRD.md`'s and `TAS.md`'s Express-specific structure (`server/modules/...`) is superseded and must not be used as an implementation reference.

---

## 2. Inventory ownership — Branch, not Business Unit

**Conflict:** This question ("Q21") was answered inconsistently across the corpus, including within a single document.

- **Business-Unit-owned position** (minority, earlier/outlier): `TAS.md` §10 ("You selected: C — Business Unit has its own inventory... Stock is not shared between Business Units"); `Database_Architecture.md` v2 (independent per-BU catalog/inventory); `Database_Archutecture_and_Model.md` (Stage 15, "Locked decisions": "Business-unit inventory," §15.8).
- **Branch-owned position** (majority, later, repeated): `Financial_Architecture_Accounting_Reconciliation.md` (Stage 5, §36–37); `Product_and_Inventory_Engine.md` (Stage 6, §21: "A business unit does NOT have its own inventory... Shared Branch Inventory"); `Inventory_Operations_Stock_Transfers_and_Cash.md` (Stage 9, §31); `Inventory_and_Stock_Management_Architecture.md` (Stage 19, §19.7–19.8: "the branch remains the primary inventory boundary while the business unit provides operational ownership/context"); `Business_Structure_Branche.md` (Stage 24, §24.42 decision table: "Branch-specific inventory ✅," "Business-unit inventory context ✅" — context, not ownership); `Product_Inventory_and_Commerce_Management.md` (**Stage 28, the latest document to directly re-adjudicate this question**, §28.24: "Q21 — C. Business units do not maintain completely independent inventory pools. Instead, inventory belongs to the branch...").
- `Functional_Specification.md` contains **both** positions in the same file (§291 branch-owned, §497 BU-owned later in the file) — clear evidence the question was never definitively closed in the raw conversation transcript.

**Resolution:** The project brief supplied to build this roadmap states explicitly — **"Inventory is branch-specific according to the previously established architecture."** This matches the majority, most-recent, and most-repeated position above. **Inventory belongs to the Branch**: one shared stock pool per branch. Business Unit is recorded on inventory movements and sales for reporting/attribution and controls *what it is permitted to sell/use* from that pool, but does not own an isolated stock count. `TAS.md` §10 and `Database_Archutecture_and_Model.md`'s "Business-unit inventory" locked decision are superseded.

---

## 3. Product ↔ Business Unit cardinality (Q23) — confirmed, refined

**Conflict:** `Database_Architecture.md` v2 (§1, an early, pre-Q23-correction document) proposes a "Product Master → multiple independent per-Business-Unit Catalog entries" model, where one product can exist in several business units at once.

Every document from Stage 5 onward states the opposite, and it is explicitly re-locked in `Business_Structure_Branche.md` (Stage 24, §24.13): "You corrected Q23 and explicitly said: **Keep my answer.** Therefore: The same product cannot exist in multiple business units." This also matches the project brief directly.

**Resolution:** **A product belongs to exactly one Business Unit.** `Inventory_and_Stock_Management_Architecture.md` (Stage 19, §19.5) adds a useful refinement, adopted here: the constraint is scoped **within a branch** — the same product *concept* may independently exist as a separate product record in a different branch (each branch's copy is its own row, its own price, its own stock). `Database_Architecture.md` v2's multi-BU catalog model is superseded.

---

## 4. Stock transfer scope — branch-to-branch only for MVP

**Conflict:** `PRD.md` §15 and `TAS.md` §15 model transfers as `Source Business Unit → Destination Business Unit`, and `Database_Architecture.md` v2 §5 uses a worked example of a supermarket transferring stock to an in-house pharmacy (i.e., cross-business-unit, same branch).

`Business_Structure_Branche.md` (Stage 24 — the latest, most dedicated hierarchy document, §24.42 decision table) explicitly states: **"Business-unit-to-business-unit stock transfers ❌ MVP"**, with cross-**branch** transfers explicitly supported (✅) instead — its own worked example is branch-to-branch, same business unit ("Wuse Supermarket → Gwarinpa Supermarket").

**Resolution:** Given inventory is branch-owned (Decision #2), this resolution is also the structurally consistent one: **stock transfers move inventory between branches** (typically the same business-unit type at each branch — e.g., Supermarket-A at Branch 1 to Supermarket-A at Branch 2), executed as a simple atomic sequence (verify source stock → deduct source → add destination → record movement → mark complete), producing an immutable audit record. The frequently-cited "supermarket transfers to its own in-house pharmacy" example from `PRD.md`/`TAS.md`/`Database_Architecture.md` v2 is a stale illustrative scenario that predates the MVP-scope restriction and is **not supported** at MVP — moving stock from a Supermarket BU to a Pharmacy BU within the same branch is not a transfer, since the pharmacy would need to carry that product as its own distinct product record under the branch's shared pool, subject to Decision #3's constraint.

---

## 5. Super Admin scope — assumption, not a document conflict (flag for confirmation)

The corpus describes a Super Admin with platform-wide "client management," "client configuration," and cross-client pricing/audit access (`PRD.md` §9). Taken literally, this implies a multi-tenant meta-console spanning every deployed client — which sits awkwardly against the repeatedly-stated deployment model of **one independent Supabase project + one independent app deployment per client** (`TAS.md` §44, Stage 32 §32.31 deployment diagrams — each client gets its own `Vercel + Supabase` pair).

No document in the corpus describes a separate, additional "meta-platform" service that would host a genuine cross-client Super Admin console, and building one would itself violate the $0–$10/month, no-unnecessary-infrastructure constraint (Decision context, not a hard textual conflict — flagged as an assumption).

**Working assumption used in this roadmap:** **Super Admin is the platform owner's untethered role *within each single-tenant deployment*** — full override access to that one client's organization, branches, business units, subscription/pricing configuration, and audit trail — not a separate cross-deployment admin service. If the actual intent is a genuine multi-client console (e.g., the platform owner manages many client deployments from one shared dashboard), that is a materially different, additional system and should be raised with the project owner before Milestone 13 begins.

---

## 6. Notification delivery — no event outbox; the milestone doc overrides the design corpus

`Notifications_Emails_and_Event_Sysytems.md` §7 proposes an `event_outbox` table (`event_type`, `aggregate_type`, `aggregate_id`, `payload`, `processed_at`) as the mechanism that keeps notification delivery from blocking the transaction that triggered it. `docs/milestones/12-notifications-and-communications.md`'s Implementation Notes explicitly forbid it: "Do not introduce a message queue... synchronous delivery within the Server Action, with graceful failure handling, is sufficient at this scale." Per this register's own rule (the milestone doc is the implementation-ready reconciliation; the design corpus is raw source material), the milestone doc wins.

**What was built instead:** each `notify_<event>()` `SECURITY DEFINER` Postgres function (`supabase/migrations/20260824100400_create_notification_functions.sql`) inserts its in-app rows via `INSERT ... ON CONFLICT DO NOTHING ... RETURNING`, and the `RETURNING` set — exactly the rows actually inserted, not suppressed by the dedupe cooldown — is the caller's email worklist. Nothing is ever persisted as "pending"; there is no `processed_at` to sweep. The caller (`lib/notifications/low-stock.ts`, `role-changed.ts`) is invoked strictly after its triggering business RPC has already committed, in its own transaction, and never throws — so failure isolation is structural (nothing downstream of a commit can roll it back) rather than dependent on an outbox's retry semantics.

**Two related calls made in the same milestone, following the same reconciliation:**

- The low-stock predicate is `available_quantity` (quantity minus what's reserved for a layaway/open order) everywhere, not raw `quantity` — Milestone 10's reporting RPC already used it; `lib/inventory/queries.ts` and the inventory view were the outliers and now agree.
- Notification retention (design corpus §43: sweep read rows after ~90 days) is deferred to Milestone 13, which needs a scheduled-execution primitive anyway for subscription-expiry warnings — building that primitive once and adding a three-line sweep to it is less infrastructure than building a scheduler twice.

---

## Confirmed, non-conflicting decisions (stated for completeness — no ambiguity found)

- **Offline capability:** consistently and unambiguously removed across every document that discusses it (`PRD.md` §5/§32, `TAS.md` Invariant 10 and §18, `Hardware_Security_Audit_Observability_and_ AI.md` §31.47–49). No milestone reintroduces it.
- **Paystack scope:** exclusively software-subscription billing, never POS customer payments — stated identically without exception everywhere it's mentioned (`PRD.md` §17/§37, `TAS.md` §20/§30, Stage 26, Stage 30 §30.35, Stage 32).
- **AI:** architecturally anticipated, never a dependency of core POS operations (`TAS.md` §39, Stage 31 §31.41–43). No milestone builds AI features; Milestone 10's reporting layer is structured so a future AI feature could consume it without a rewrite.
- **Testing scope of POS transactions:** both the earliest (`PRD.md` §44) and latest (Stage 32 §32.12) documents agree, verbatim in spirit: no dedicated "POS transaction test" *category* is required, but the underlying transaction/business logic still requires unit + integration coverage. This is honored in Milestone 08's Testing Requirements.
