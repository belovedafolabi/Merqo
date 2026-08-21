# Milestone 10 — Reporting, Analytics & Accounting

## Status

Planned

## Objective

Build the standard report catalog (sales, inventory, financial, customer), the custom report builder with filters/grouping/export, and the intermediate accounting calculations (revenue, COGS, gross profit, expenses, net profit) — all reading from the normalized transactional data produced by Milestones 06–09, not from duplicated report-specific tables.

## Why This Milestone Exists

Reporting and accounting are where the value of every earlier milestone's careful ledger/immutability work becomes visible to the business owner. `docs/TAS.md` §34 is explicit that reports should query normalized transactional data directly (introducing views/materialized views/aggregation tables only if profiling later demonstrates a real need) — this keeps infrastructure free and avoids a second, parallel data model that could drift from the transactional source of truth.

## Dependencies

- Milestone 06 (product/pricing data).
- Milestone 07 (inventory data).
- Milestone 08 (sales/returns/refunds data).
- Milestone 09 (customer/store-credit/layaway data).

## Scope

- Standard reports: Sales (by date, branch, business unit, employee, product, category, payment method), Inventory (current stock, stock movement, low stock, expiry, valuation), Financial (revenue, COGS, gross profit, expenses, net profit, tax, discounts, refunds), Customer (customer transactions, store credit, layaway) — per `docs/PRD.md` §28.
- Custom report builder: filters, sorting, date ranges, grouping, aggregation, saved configurations, export (CSV, Excel, PDF), per `docs/PRD.md` §29.
- Accounting calculations: revenue, COGS, gross profit, expenses, net profit, payment summaries, store-credit balances, layaway balances, per `docs/PRD.md` §27 — an intermediate accounting module, explicitly not a full accounting ERP.
- Query-level performance work: appropriate indexes on transactional tables to support common report queries; introduce SQL views only where they simplify a report query, and materialized views/aggregation tables only if a real performance need is demonstrated (per `docs/TAS.md` §34) — not built speculatively.

## Out of Scope

- Full ERP-grade accounting (accounts payable/receivable ledgers, multi-currency, tax filing) — explicitly excluded (`docs/PRD.md` §5).
- AI-driven insights/natural-language reports — architecturally anticipated but not built (per `docs/TAS.md` §39; this milestone's data layer should be structured so a future AI feature could query it, but no AI integration is implemented here).
- Notification delivery for report-triggered alerts (e.g., a low-stock report existing here is distinct from the low-stock *notification* built in Milestone 12).

## Functional Requirements

- Every standard report listed above is available, correctly scoped to the current user's organization/branch/business-unit permissions.
- Custom reports allow an authorized user to select dimensions/filters/grouping without writing SQL, and to save a configuration for reuse.
- Export produces correct CSV, Excel, and PDF output matching the on-screen report.
- Accounting calculations (revenue, COGS, gross profit, net profit) are correct against the underlying transactional data and reconcile with the ledgers built in Milestones 07–09.
- No custom report path allows a user to submit raw SQL — the builder only composes queries from a fixed, permission-checked set of dimensions and metrics, per `docs/Security _Architecture_And_Authorization.md` §68's "Raw SQL from custom reports: Never."

## Technical Requirements

- Standard reports implemented as parameterized queries against the existing transactional tables (or thin SQL views where that measurably simplifies the query), not new denormalized tables populated by application-level ETL.
- Custom report builder implemented as a structured query-composition layer (a fixed, whitelisted set of joinable dimensions/metrics) — never string-concatenated or user-supplied SQL.
- Export generation: CSV/Excel via a lightweight library, PDF via a server-side rendering approach consistent with the receipt-rendering pattern already established in Milestone 08 (avoid introducing a second, unrelated PDF-generation approach).

## Database Changes

- Indexes added to `sales`, `sale_items`, `inventory_movements`, and related tables as needed to support common report query patterns (identified during implementation via query analysis, not guessed).
- Optional: SQL views for genuinely repeated complex joins (e.g., a `v_sales_with_items` view), added only where they reduce duplication — no materialized views/aggregation tables unless profiling demonstrates a need.

## API / Backend Changes

- Server Actions/queries: each standard report's data-fetching function; the custom-report-builder's query-composition and execution engine; export generation for each format.

## Frontend Changes

- Report catalog navigation (Admin Dashboard).
- Each standard report's display screen (table/chart as appropriate — charts kept simple and native, no paid charting SaaS).
- Custom report builder UI (dimension/filter/grouping selection, save/load configuration, export buttons).
- Accounting summary dashboard (revenue/COGS/profit at a glance).

## Security Requirements

- All report queries scoped by the requesting user's organization/branch/business-unit permissions — a Branch Manager cannot see another branch's financial reports unless explicitly granted cross-branch reporting permission (per `docs/Business_Structure_Branche.md` §24.42's "cross-branch reporting ✅" being an explicit, grantable capability, not a default for every role).
- Export actions are permission-checked (`reports.view`, `reports.export`) distinctly, since export is a higher-risk data-exfiltration surface than on-screen viewing.
- The custom report builder's fixed dimension/metric whitelist is itself the enforcement mechanism preventing raw SQL access — reviewed explicitly against `docs/Security _Architecture_And_Authorization.md` §68 during implementation.

## Testing Requirements

- Unit tests: accounting calculation correctness (revenue, COGS, gross profit, net profit) against known seeded transactional scenarios.
- Integration tests: each standard report returns correct, correctly-scoped data for a given seeded dataset and user permission set.
- Security tests: the custom report builder rejects any attempt to inject raw SQL or access a non-whitelisted dimension/metric; a user without cross-branch reporting permission cannot retrieve another branch's data.
- Export tests: generated CSV/Excel/PDF files contain the expected data for a known report configuration.

## CI/CD Requirements

- Extend the pipeline with this milestone's test suites; add a check that report query performance (for the seeded test dataset size) stays within an acceptable threshold, as an early warning before performance becomes a real problem at scale.

## Observability

- Structured logging on report/export execution time, to catch slow queries early rather than discovering them under real production data volume (feeds into Milestone 16's performance work if needed).

## Deliverables

- Full standard report catalog.
- Working custom report builder with save/export.
- Accounting summary calculations and dashboard.

## Acceptance Criteria

- [ ] All standard reports (sales, inventory, financial, customer) return correct, correctly-scoped data.
- [ ] The custom report builder produces correct results without any raw-SQL or non-whitelisted-dimension access path.
- [ ] CSV, Excel, and PDF export all produce correct output matching the underlying report.
- [ ] Accounting calculations reconcile correctly against the transactional and ledger data from Milestones 06–09.
- [ ] Report/export access is permission-scoped and cannot leak cross-organization or unauthorized cross-branch data.

## Definition of Done

All acceptance criteria pass, report query performance against the seeded test dataset is reviewed and acceptable, and no new denormalized/duplicated data table exists that could drift from the transactional source of truth.

## Implementation Notes

- Do not introduce a paid BI/analytics tool or a dedicated analytics database — this milestone works entirely against the existing Postgres database, per the project's cost constraint.
- If a specific report proves slow against realistic data volume, prefer adding an index or a simple SQL view before reaching for a materialized view or aggregation table, per `docs/TAS.md` §34's incremental-complexity guidance.

## Risks

- Custom report builders are a classic source of accidental data leakage (cross-tenant or cross-permission) — the fixed-whitelist approach here is the mitigation; any future extension to the builder's flexibility must go through the same whitelist discipline, not an escape hatch.

## Future Considerations

- The data layer built here (normalized transactional queries, no denormalized shadow tables) is intentionally structured so a future AI-driven insights feature (explicitly anticipated but not built, per `docs/TAS.md` §39) could query it directly without a rework — but no AI integration is in scope for this milestone.
