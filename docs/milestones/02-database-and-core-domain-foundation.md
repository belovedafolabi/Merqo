# Milestone 02 — Database & Core Domain Foundation

## Status

Planned

## Objective

Design and migrate the foundational Postgres schema that every other milestone builds on: Organizations (clients), Branches, Business Units, Business Types, the Capability/configuration engine, and the base scaffolding for Users/Roles/Permissions tables (populated fully in Milestone 03). Lock in, at the schema level, the two most expensive-to-reverse decisions in the whole project: branch-owned inventory and one-product-per-business-unit.

## Why This Milestone Exists

Per `docs/TAS.md` §55, the database schema — specifically the Organization → Branch → Business Unit → Product → Inventory → Sale chain — is one of the three areas in this project "where mistakes would be particularly expensive to correct later." This milestone exists to get that chain right, once, before any feature code depends on it. It also stands up the Capability/configuration engine, which is what makes this a genuinely *Dynamic* POS rather than a set of hard-coded per-industry branches — every later feature milestone (Products, Inventory, POS, Reporting) reads capability flags instead of branching on business type in code.

## Dependencies

- Milestone 01 (repo, Supabase project connection, migration tooling in CI).

## Scope

- Core hierarchy tables: `organizations`, `branches`, `business_units`, `business_types`, `capabilities`, `business_unit_capabilities`.
- Configuration precedence scaffolding (Platform default → Business Type default → Organization → Branch → Business Unit), implemented as documented, explicit override columns/tables — not a fully generic key-value settings engine (avoids over-engineering per `docs/TAS.md` §9).
- Base `users`, `roles`, `permissions`, `role_permissions`, `user_roles` tables created (structure only — Supabase Auth wiring, RLS policies, and the authorization layer are Milestone 03's scope).
- Base `audit_logs` table structure (append-only; write path and helper functions land in Milestone 03 alongside the first real events).
- Migration tooling: Supabase CLI migrations, version-controlled, applied via CI/CD to each environment.
- Seed script(s) for local/dev: the 13 target business types (per `docs/PRD.md` §6) and the initial capability catalog (per `docs/TAS.md` §7 — `products`, `inventory`, `batch_tracking`, `expiry_tracking`, `service_charge`, `layaway`, `store_credit`).
- Database-level integrity constraints implementing the locked decisions: inventory tables reference `branch_id` (not `business_unit_id`) as the ownership key; `products.business_unit_id` is required and `UNIQUE(business_unit_id, sku)` / `UNIQUE(business_unit_id, barcode)` are enforced at the database level.

## Out of Scope

- Supabase Auth integration and session handling (Milestone 03).
- RLS policy authoring (Milestone 03 establishes the pattern; each later milestone adds policies for its own tables).
- Product, inventory-balance, sales, customer, and every other domain table beyond the core hierarchy and RBAC scaffolding above (each owned by its respective milestone).
- Business Unit configuration UI (Milestone 05).

## Functional Requirements

- An Organization can have many Branches; a Branch can have many Business Units; a Business Unit references exactly one Business Type.
- A Business Type is a configuration template only — selecting one seeds default capability flags on a new Business Unit but never hard-codes behavior in application code (no `if (businessType === 'restaurant')` anywhere; capability flags are the only signal).
- A Business Unit's enabled capabilities can diverge from its Business Type's defaults (explicit override, per `docs/TAS.md` §8).
- The schema physically prevents (via foreign keys/constraints) inventory or product data from being attached in a way that contradicts Decisions #2 and #3 in `DECISIONS_AND_CONFLICTS.md`.
- Soft-delete/archive is supported for Organizations, Branches, and Business Units — hard deletion of operational entities is excluded per `docs/Business_Structure_Branche.md` §24.42.

## Technical Requirements

- All schema defined as Supabase/Postgres migrations, checked into `supabase/migrations/`, applied automatically in CI against a disposable test database and manually promoted to staging/production via the documented migration strategy from Milestone 01.
- Every table includes standard audit columns: `created_at`, `updated_at`, `created_by`, and (where archivable) `archived_at`.
- Primary keys use UUIDs (Supabase convention) so future cross-environment data movement (e.g., seed data reused across per-client deployments) doesn't collide.
- No ORM introduced beyond the Supabase JS client and hand-written SQL migrations — avoids adding a second schema-definition source of truth.

## Database Changes

- New tables: `organizations`, `branches`, `business_units`, `business_types`, `capabilities`, `business_unit_capabilities`, `users` (skeleton), `roles` (skeleton), `permissions` (skeleton), `role_permissions` (skeleton), `user_roles` (skeleton), `audit_logs` (skeleton).
- Foreign keys: `branches.organization_id → organizations.id`; `business_units.branch_id → branches.id`; `business_units.business_type_id → business_types.id`; `business_unit_capabilities.business_unit_id → business_units.id`, `business_unit_capabilities.capability_id → capabilities.id`.
- Constraints establishing the locked architecture decisions (inventory keyed to branch, not business unit; products uniquely scoped to one business unit) are documented here as schema *intent* even though the `products`/`inventory_balances` tables themselves are created in Milestones 06/07 — this milestone's ER design must not contradict them.
- Seed data: 13 business types, initial capability catalog.

## API / Backend Changes

- No application-facing API yet beyond what Milestone 01 stubbed. This milestone is schema-and-migrations only; Server Actions/Route Handlers for creating/reading Organizations/Branches/Business Units are built in Milestone 05 once Auth (Milestone 03) and the Design System (Milestone 04) exist to gate and present them.

## Frontend Changes

None. No UI is built against this schema until Milestone 05.

## Security Requirements

- RLS is enabled (`ENABLE ROW LEVEL SECURITY`) on every table created in this milestone immediately upon creation, even though the actual policies are authored in Milestone 03 — a table must never exist in an unprotected, RLS-disabled state, even transiently, past the PR that creates it.
- No table in this milestone is reachable from the client without going through the (not-yet-built) authorization layer — until Milestone 03 lands, these tables are only touched via migrations/seeds, never application code.

## Testing Requirements

- Migration tests: migrations apply cleanly to a fresh database and are idempotent/reversible where feasible.
- Schema constraint tests: attempting to violate the locked decisions (e.g., inserting two products with the same SKU in the same business unit) fails at the database level — written as integration tests against a real (test) Supabase/Postgres instance, not mocked.
- Seed script tests: seed data loads without error and produces the expected row counts.

## CI/CD Requirements

- Extend Milestone 01's pipeline with a migration-apply step: spin up a disposable Postgres/Supabase instance in CI, apply all migrations, run the schema constraint tests above, tear down.
- Fail the build if a migration fails to apply or if migrations are not idempotent when reapplied.

## Observability

- Migration failures surfaced clearly in CI logs (which migration, which statement).
- No new runtime observability needed yet (no application code executes against this schema in this milestone).

## Deliverables

- Full set of migrations for the core hierarchy and RBAC/audit-log skeleton tables.
- Seed scripts for business types and capabilities.
- A short internal `docs/architecture/database-conventions.md` (or equivalent) capturing the naming/constraint conventions established here, so every later milestone's schema additions stay consistent.

## Acceptance Criteria

- [ ] Migrations apply cleanly to a fresh database in CI.
- [ ] Organization → Branch → Business Unit → Business Type relationships are enforced by foreign keys.
- [ ] A Business Unit's capabilities can be read and are seeded from its Business Type's defaults, with override supported.
- [ ] Attempting to violate the one-product-per-business-unit or branch-owned-inventory intent (tested via the placeholder constraints/documentation this milestone establishes) is rejected.
- [ ] RLS is enabled on every new table.
- [ ] Seed data for 13 business types and the initial capability catalog loads successfully.
- [ ] CI applies migrations and runs schema tests on every PR.

## Definition of Done

All acceptance criteria pass in CI, the schema is reviewed against `DECISIONS_AND_CONFLICTS.md` line-by-line with no contradictions found, and the database conventions doc exists for later milestones to follow.

## Implementation Notes

- Resist the temptation to build a fully generic EAV/settings-table configuration engine "to be safe" — `docs/TAS.md` §9 explicitly warns against making every setting configurable at every level. Model the configuration precedence with explicit, typed columns/override tables per setting as those settings are introduced by later milestones, not speculatively now.
- Keep `capabilities` as a small, curated catalog (the list in Scope above) rather than an open-ended plugin registry — matches the project's preference for a maintainable configuration-driven architecture over a dynamic plugin system.

## Risks

- Getting the branch-vs-business-unit inventory boundary wrong here is the single most expensive mistake this project could make (per `docs/TAS.md` §55) — this milestone's review must explicitly cross-check every table/constraint against `DECISIONS_AND_CONFLICTS.md` §2 and §3 before merging.
- Seeding a fixed list of 13 business types risks looking hard-coded; mitigate by keeping `business_types` a normal, insertable table (Super Admin can add a 14th later via Milestone 13's admin tooling, not a code deploy) rather than an enum.

## Future Considerations

- The capability catalog will grow as later milestones (Inventory, POS, Customers) introduce new toggleable behaviors (e.g., `table_management` if ever revisited) — the `capabilities`/`business_unit_capabilities` structure is designed to absorb new rows without a schema migration to the pattern itself, only a data insert.
