# Database Conventions

Established in Milestone 02 (`docs/milestones/02-database-and-core-domain-foundation.md`). This is the contract every later milestone's schema additions must follow — amended when a real need arises, never silently reinterpreted per-milestone.

## Naming conventions

- Tables: `snake_case`, plural (`organizations`, `branches`, `business_units`).
- Columns: `snake_case`.
- Unique indexes: `<table>_<columns>_key` (e.g. `business_types_slug_key`).
- Non-unique indexes: `<table>_<columns>_idx` (e.g. `branches_organization_id_idx`).
- Triggers: `trg_<table>_<purpose>` (e.g. `trg_organizations_updated_at`, `trg_business_units_seed_capabilities`).
- Migration files: `<timestamp>_create_<table>.sql` (or `_alter_<table>_<change>.sql` for later modifications). One table per migration — see "Migration file conventions" below.

## UUID primary keys

Every table's primary key is `uuid primary key default gen_random_uuid()`. `gen_random_uuid()` is native to Postgres since v13 — no `pgcrypto`/`uuid-ossp` extension needed on this project's Postgres 17. UUIDs are used (over serial/bigint) so seed data and records can move across environments — including reuse across the per-client deployments this platform ships (one independent Supabase project per client, per `docs/milestones/DECISIONS_AND_CONFLICTS.md` §5) — without primary-key collisions.

## Standard audit columns

Every table includes `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`, and `created_by uuid references public.users(id) on delete set null`. `updated_at` is kept current by the shared `set_updated_at()` trigger function (`supabase/migrations/20260822090000_create_set_updated_at_function.sql`) — reuse it, don't hand-roll a new `BEFORE UPDATE` trigger per table. That trigger uses `clock_timestamp()`, not `now()`: `now()` is fixed for the whole transaction, so it can't distinguish an UPDATE from an earlier INSERT/UPDATE in the same transaction — `clock_timestamp()` reflects real wall-clock time at the moment the trigger fires.

**Documented exception: `audit_logs`.** An audit row is append-only and never updated, so it has no `updated_at` and no `set_updated_at` trigger. It also has no `created_by` — the table already carries `user_id` as the acting user, and duplicating that as `created_by` would be redundant on a table whose entire purpose is recording who did what.

## Soft-delete (`archived_at`) vs. `is_active`

Two distinct concepts, used on different table categories — do not conflate them:

- **`archived_at timestamptz` (soft-delete)** — used on *operational/tenant* entities: `organizations`, `branches`, `business_units`. Hard deletion of these is excluded by design (`docs/Business_Structure_Branche.md` §24.42). A `null` value means active; a timestamp means archived. Uniqueness constraints on these tables are partial indexes scoped `where archived_at is null`, so an archived record's slug/name can be reused by a new active record.
- **`is_active boolean` (catalog toggle)** — used on *curated reference/catalog* tables: `business_types`, `capabilities`. These aren't tenant data with a lifecycle to audit; they're a small, centrally-managed list that a Super Admin can turn on/off. No partial-uniqueness dance needed — the natural key (`slug`, `key`) stays unique regardless of active state.

## RLS-enable-now, policy-later

Every migration that creates a table ends with `alter table public.<table> enable row level security;` in the *same file* that creates the table — never as a separate follow-up migration. This makes "a table must never exist in an unprotected, RLS-disabled state, even transiently" (per the Milestone 02 spec's Security Requirements) a property of each file in isolation, not something that depends on remembering a second step. With RLS enabled and zero policies defined, Postgres default-denies all access — correct and expected until Milestone 03 authors the first real policies. Milestone 03 (and every later milestone touching these tables) **adds** policies; it never removes this line.

## Delete-behavior conventions

- **`ON DELETE RESTRICT`** on the operational hierarchy's parent-pointing foreign keys (`branches.organization_id`, `business_units.branch_id`, `business_units.business_type_id`, `user_roles.role_id`). Since soft-delete is the real deletion path for operational entities, RESTRICT should never actually fire in normal operation — it exists as a safety net against an accidental hard `DELETE` silently orphaning or cascading through child records.
- **`ON DELETE CASCADE`** on pure config/mapping join tables (`business_type_capabilities`, `business_unit_capabilities`, `role_permissions`, `user_roles.user_id`). These rows have no independent meaning once their parent is gone.
- **`ON DELETE SET NULL`** on audit-trail foreign keys (`audit_logs.organization_id`, `audit_logs.user_id`, every table's `created_by`). Never lose history because a referenced row was removed.

## No ORM

Schema is defined exclusively as hand-written SQL migrations in `supabase/migrations/`, applied via the Supabase CLI. The `@supabase/supabase-js` client is used for querying application data at runtime, but never for schema definition — introducing an ORM would create a second, competing source of schema truth.

## Capability catalog is curated, typed tables — not EAV

`capabilities`, `business_type_capabilities`, and `business_unit_capabilities` are explicit, typed tables with a small, fixed catalog (see Milestone 02's Scope: `products`, `inventory`, `batch_tracking`, `expiry_tracking`, `service_charge`, `layaway`, `store_credit`). This is a deliberate rejection of a generic key-value/EAV settings engine, per `docs/TAS.md` §9's explicit warning against making every setting configurable at every level. New capabilities are added as rows when a later milestone introduces genuinely new toggleable behavior (e.g. a future `table_management` capability), never speculatively ahead of a real feature.

`business_type_capabilities` holds each Business Type's **default** flags; `business_unit_capabilities` holds each Business Unit's **actual** flags, auto-seeded from the former via the `seed_business_unit_capabilities()` trigger (`supabase/migrations/20260822090800_create_business_unit_capabilities.sql`) when a Business Unit is created, then independently overridable (`is_override = true`) without retroactively following later changes to the Business Type's defaults.

## Configuration precedence

The design corpus (`docs/TAS.md` §9) describes a five-level precedence model: **Platform default → Business Type default → Organization → Branch → Business Unit**. Milestone 02 implements the first two concrete levels of this chain for capabilities specifically — Business Type default (`business_type_capabilities`) and Business Unit override (`business_unit_capabilities`, `is_override`) — because that's the one setting this milestone actually owns. The Organization- and Branch-level override tiers, and every other setting the precedence model could apply to, are **not** scaffolded generically here; per the same warning cited above, each gets its own explicit typed column/table only when a later milestone introduces a concrete setting that needs it.

## Forward-looking constraint intents (Milestones 06/07)

`products` and `inventory`-related tables don't exist yet, but this milestone's ER design must not contradict where they're headed (`docs/milestones/DECISIONS_AND_CONFLICTS.md` #2 and #3, documented inline in `supabase/migrations/20260822090600_create_business_units.sql`):

- **Inventory is branch-owned** (Decision #2) — inventory tables will key to `branch_id`, not `business_unit_id`. A Business Unit is attribution/permission context on inventory movements, never an isolated stock owner.
- **A product belongs to exactly one Business Unit** (Decision #3), scoped within its branch — `products.business_unit_id` will be `NOT NULL` with `UNIQUE(business_unit_id, sku)` and `UNIQUE(business_unit_id, barcode)`.

Any later milestone whose design would require a `business_unit_id`-keyed inventory table, or a product row shared across multiple Business Units, contradicts a locked decision — stop and re-read `DECISIONS_AND_CONFLICTS.md` before proceeding.

## Migration file conventions

- One table per migration file. Gives a clean diff/rollback story and makes the migration file list itself double as documentation of the ER design.
- Create a new migration with `pnpm exec supabase migration new <name>`.
- Idempotency is verified in CI by running `supabase db reset` twice in a row (see `.github/workflows/ci.yml`, job `db-migrations`) — since `db reset` always drops and rebuilds the schema from scratch, a from-scratch apply failure is caught immediately; what the double-reset actually exercises is `seed.sql`'s `on conflict ... do nothing` idempotency.
