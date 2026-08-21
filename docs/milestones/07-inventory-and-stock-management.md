# Milestone 07 — Inventory & Stock Management

## Status

Planned

## Objective

Build the branch-owned inventory ledger — current-balance and historical-movement tables, stock adjustments, low-stock and expiry/batch tracking, and simple branch-to-branch stock transfers — implementing `DECISIONS_AND_CONFLICTS.md` §2 and §4 as real, working functionality.

## Why This Milestone Exists

Inventory is the third of `docs/TAS.md` §55's expensive-to-reverse areas. It is also where the project's most-debated architectural question (branch- vs. business-unit-owned inventory) becomes concrete, working code rather than a documented decision. Every later milestone that touches stock — POS checkout (Milestone 08), reporting (Milestone 10) — depends on this ledger being correct and auditable from the start, per `docs/TAS.md` §14's ledger principle: never mutate a quantity without recording why.

## Dependencies

- Milestone 06 (Products must exist for inventory records to reference).

## Scope

- Inventory balance tracking: current quantity, reserved quantity, available quantity — keyed to **Branch**, per `DECISIONS_AND_CONFLICTS.md` §2 (not Business Unit), with `business_unit_id` retained on movements for attribution/reporting.
- Inventory movement ledger: append-only record of every stock change (`SALE`, `RETURN`, `ADJUSTMENT`, `TRANSFER_OUT`, `TRANSFER_IN`), per `docs/TAS.md` §13–14. Balances are derived/maintained from movements, never mutated as a bare decrement without a corresponding movement row.
- Manual stock adjustments (with reason codes — required for auditability).
- Low-stock thresholds and low-stock condition detection (the actual notification delivery is Milestone 12's scope; this milestone detects and exposes the condition).
- Batch tracking and expiry-date tracking (used by, but not exclusive to, pharmacy-type business units — modeled as a general capability per Milestone 02's capability engine, not a pharmacy-specific hard-coded feature).
- Simple branch-to-branch stock transfers: verify source stock → deduct source → add destination → record movement → mark complete, executed atomically, producing an immutable audit record, per `DECISIONS_AND_CONFLICTS.md` §4 (branch-to-branch, not business-unit-to-business-unit).
- Inventory valuation basics (quantity × cost price, feeding Milestone 10's reporting).

## Out of Scope

- POS checkout's inventory deduction call path (Milestone 08 calls into this milestone's movement-recording function; the checkout flow itself is not built here).
- Business-unit-to-business-unit transfers — explicitly excluded from MVP (Decision #4).
- Low-stock/expiry *notification delivery* (Milestone 12 — this milestone only detects and exposes the condition via query/flag).
- Financial/valuation reporting UI (Milestone 10 — this milestone provides the underlying data).

## Functional Requirements

- Inventory balances are tracked per Branch (shared across the Business Units operating in that branch), with `business_unit_id` recorded on each movement for reporting attribution and to enforce "what a business unit is permitted to sell" per its product scope.
- No inventory quantity is ever changed without a corresponding, permanent movement record explaining the change.
- Stock adjustments require a reason and are auditable.
- A stock transfer between two branches is atomic: it either fully succeeds (source deducted, destination credited, both movements recorded) or fully fails with no partial state.
- Attempting to transfer more stock than is available at the source branch is rejected.
- Batch/expiry data can be attached to inventory records where the relevant capability is enabled for a business unit.
- A low-stock condition is queryable (below configured threshold) for later consumption by Milestone 12.

## Technical Requirements

- All inventory mutations execute inside a database transaction, with appropriate locking to guarantee atomicity under concurrent access (per `docs/TAS.md` §18's concurrency requirement — "inventory validation and inventory deduction must occur atomically").
- Movement recording implemented as a single shared server-side function (e.g., `recordInventoryMovement()`), used by adjustments, transfers, and (later) sales/returns in Milestone 08 — never duplicated per call site.
- Balances table is a materialized/derived convenience for fast current-stock queries (per `docs/TAS.md` §13), always reconcilable against the movement ledger — implemented so a balance can be recomputed from movements if ever needed for verification.

## Database Changes

- New tables: `inventory_balances` (keyed by `branch_id` + `product_id`/`variant_id`, with `business_unit_id` retained for attribution), `inventory_movements` (append-only), `stock_transfers`, `stock_transfer_items`, `batches`/`expiry_records` (where the capability is enabled).
- Constraints: no negative available quantity permitted by normal application paths (adjustments for correction are still logged movements, not silent overwrites).

## API / Backend Changes

- Server Actions: create adjustment, initiate/complete transfer, query balances, query movement history, query low-stock condition.
- Shared `recordInventoryMovement()` function, exported for reuse by Milestone 08.

## Frontend Changes

- Inventory balance view (per branch, filterable by business unit/product).
- Movement history view.
- Adjustment form (product, branch, quantity delta, reason).
- Transfer initiation/confirmation flow (source branch, destination branch, products, quantities, status).
- Low-stock indicator in the Admin Dashboard.
- Batch/expiry entry fields where the capability is enabled.

## Security Requirements

- Inventory mutations permission-checked (`inventory.adjust`, `inventory.transfer`) via the Milestone 03 guard; RLS scopes visibility/mutation to the user's authorized branch(es).
- Transfers require appropriate authorization at both source and destination (e.g., initiated by a user scoped to the source branch, confirmed/received by a user scoped to the destination branch, or an equivalent single-authorization model — decided during implementation, documented, and consistently enforced).
- All adjustments and transfers audited (who, what, why, when).

## Testing Requirements

- Unit tests: `recordInventoryMovement()` correctly updates balances and never allows a balance to drift from the sum of its movements.
- Concurrency tests: two simultaneous adjustments/transfers against the same product/branch do not produce an incorrect final balance (explicit test simulating concurrent requests against a real test database).
- Integration tests: a transfer that exceeds available source stock is rejected; a successful transfer produces exactly one `TRANSFER_OUT` and one `TRANSFER_IN` movement and updates both branches' balances correctly.
- Authorization tests: adjustments/transfers blocked for unauthorized users, server-side and via RLS.

## CI/CD Requirements

- Extend the pipeline with this milestone's test suites, including the concurrency test (run against a real disposable Postgres instance, not mocked, since correct locking behavior cannot be validated with a mock).

## Observability

- Audit log entries for every adjustment and transfer.
- Structured logging on transfer failures (insufficient stock, authorization failure) to aid operational troubleshooting.

## Deliverables

- Branch-owned inventory balance and movement ledger.
- Working stock adjustment and branch-to-branch transfer flows, atomic and audited.
- Batch/expiry tracking where enabled.
- Low-stock condition detection, ready for Milestone 12 to notify on.
- Shared `recordInventoryMovement()` function ready for Milestone 08 to consume.

## Acceptance Criteria

- [ ] Inventory balances are correctly keyed to Branch, with Business Unit attribution retained on movements.
- [ ] Every balance change has a corresponding movement record; no bare quantity mutation exists anywhere in the codebase.
- [ ] Concurrent adjustment/transfer attempts against the same stock produce a correct, non-racy final balance.
- [ ] A transfer exceeding available stock is rejected; a valid transfer is atomic and fully audited.
- [ ] Business-unit-to-business-unit transfers are not exposed anywhere in the UI or API.
- [ ] Unauthorized inventory mutations are blocked server-side and via RLS.

## Definition of Done

All acceptance criteria pass, the concurrency test suite is green under CI, and a manual review confirms the `inventory_balances` table can be fully reconstructed from `inventory_movements` alone (proving the ledger, not the balance table, is the true source of truth).

## Implementation Notes

- This milestone is a direct, load-bearing implementation of `DECISIONS_AND_CONFLICTS.md` §2 and §4 — any deviation discovered during implementation must be reconciled against that document, not decided ad hoc.
- Reuse `resolveEffectivePrice()` from Milestone 06 for any inventory-valuation calculation that needs a current price; do not re-derive pricing logic here.

## Risks

- Concurrency correctness is the single highest-risk item in this milestone — under-testing it here surfaces as double-selling or lost-stock bugs much later, in Milestone 08, where they're harder to diagnose. The concurrency test suite must be built and passing before this milestone is considered done, not deferred to Milestone 08.

## Future Considerations

- If business-unit-to-business-unit transfers are ever reconsidered, the `stock_transfers` schema (already keyed with both branch and business-unit attribution) should accommodate that without a structural rewrite — but this remains explicitly out of scope until that decision is revisited with the project owner.
