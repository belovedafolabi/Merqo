# Milestone 08 — POS Transaction Engine (Sales, Checkout, Returns & Refunds)

## Status

Complete — merged via [PR #19](https://github.com/belovedafolabi/Merqo/pull/19) (2026-08-23)

## Objective

Build the actual POS: cart, barcode/search-driven product selection, discount/tax/service-charge calculation, payment recording (cash/card/bank transfer/store credit), the atomic sale transaction with concurrency and idempotency protection, and — using the same engine, not a separate one — returns and refunds referencing the original sale.

## Why This Milestone Exists

This is the third of `docs/TAS.md` §55's expensive-to-reverse areas and the product's core value proposition: "an extremely fast POS interface" backed by "strong transaction integrity and concurrency protection." Returns and refunds are deliberately included in this same milestone, not a separate one, because they operate on the same immutable-transaction, same-atomicity, same-concurrency-protected engine — treating them as a distinct phase would either duplicate the engine or create an inconsistent second implementation, both of which the project's own quality bar explicitly warns against.

## Dependencies

- Milestone 05 (Business Unit POS configuration: tax, service charge, discount policy, default payment method).
- Milestone 06 (Products, branch pricing, `resolveEffectivePrice()`).
- Milestone 07 (Inventory balances, `recordInventoryMovement()`).

## Scope

- POS shell screens (built on Milestone 04's POS shell): barcode scan / search / category browse, cart, quantity adjustment, hold/resume sale.
- Checkout calculation: discounts (fixed/percentage, permission-gated per Milestone 05's discount policy), tax, service charge, applied in a well-defined, documented order.
- Payment recording: cash, card, bank transfer, store credit (store-credit *balance deduction* mechanics are Milestone 09's ledger, consumed here at checkout) — no split payment, no mobile payment, no gift cards, no Paystack (excluded per `docs/PRD.md` §17).
- The atomic sale transaction: validate user/permissions → validate products → validate stock → calculate prices/discount/tax/service-charge → create sale + sale items + payment → deduct inventory via Milestone 07's `recordInventoryMovement()` → create audit event → commit (or roll back entirely on any failure), per `docs/TAS.md` §17.
- Concurrency protection: two cashiers cannot both sell the last unit of stock (per `docs/TAS.md` §18) — validated with the same rigor as Milestone 07's own concurrency tests, at the sale layer.
- Idempotency: a retried sale request (e.g., due to a network blip) never creates a duplicate sale (per `docs/TAS.md` §19, using an idempotency key on the request).
- Receipt generation (digital; print output specifics are Milestone 14's hardware scope, but the receipt *data model/template rendering* is built here).
- Returns: reference an original sale, record returned items/quantity/reason, reverse inventory via a `RETURN` movement (not a raw stock edit).
- Refunds: require explicit authorization (per Milestone 05's discount/authorization policy pattern), record refund amount/method, never delete or edit the original sale.
- Transaction-time price snapshot: the sale item stores the resolved price at time of sale (from Milestone 06's `resolveEffectivePrice()`), immune to later product price changes.

## Out of Scope

- Store-credit ledger internals and layaway (Milestone 09 — this milestone only *consumes* an available store-credit balance as a payment method).
- Reporting on sales data (Milestone 10 — this milestone produces the transactional records reports will query).
- Physical receipt printer integration and customer-facing display hardware (Milestone 14).
- Any dedicated "POS transaction test" *category* beyond standard unit/integration coverage — explicitly not required per `docs/PRD.md` §44 / Stage 32 §32.12 (see Testing Requirements below for what *is* required).

## Functional Requirements

- A cashier can search or scan a product, add it to a cart, adjust quantity, apply a permitted discount, and complete a sale with a supported payment method, all within the POS shell without leaving the primary screen for the common case (per `docs/TAS.md` §41).
- Checkout calculation order (discount → tax → service charge, or the specific order decided during implementation) is documented once and applied consistently everywhere a total is calculated (checkout, receipt, reports).
- A completed sale is immutable: no code path allows editing or deleting a completed sale row; corrections happen via return/refund records referencing it.
- Selling more units than are available in the branch's inventory balance is rejected at the database transaction level, not just in the UI.
- A duplicate sale submission (same idempotency key) is not double-processed.
- A return references its original sale and correctly reverses the relevant inventory quantity.
- A refund requires authorization per the configured discount/refund policy and is recorded with initiating user, authorizing user, amount, method, and reason.

## Technical Requirements

- The entire sale-creation flow executes inside a single database transaction with row-level locking sufficient to prevent overselling under concurrent access — the specific Postgres locking strategy (`SELECT ... FOR UPDATE` or equivalent) is finalized during implementation but the architectural requirement (atomic validate+deduct) is non-negotiable, per `docs/TAS.md` §18.
- Idempotency implemented via a client-supplied idempotency key stored against completed sales, checked before creating a new one.
- All calculation logic (discount/tax/service-charge/total) implemented as pure, unit-testable functions separate from the database-transaction orchestration code, so calculation correctness can be tested without spinning up a database for every case.

## Database Changes

- New tables: `sales`, `sale_items`, `payments`, `returns`, `return_items`, `refunds`.
- Sale/sale-item rows are append-only from the application's perspective: no `UPDATE`/`DELETE` grants on completed sale rows for the application database role, mirroring the audit-log immutability pattern from Milestone 03.
- `idempotency_key` column (unique constraint) on `sales`.

## API / Backend Changes

- Server Actions/Route Handlers: create sale (idempotent), hold sale, resume sale, create return, create refund, generate receipt data.
- Calculation module: discount/tax/service-charge/total calculation, pure functions, reused by checkout, receipt rendering, and (later) reporting.
- Consumes: Milestone 06's `resolveEffectivePrice()`, Milestone 07's `recordInventoryMovement()`, Milestone 05's Business Unit POS configuration, Milestone 03's authorization guard and audit helper.

## Frontend Changes

- POS cart/checkout screen (search/scan, cart, totals, payment selection) on the Milestone 04 POS shell.
- Hold/resume-sale UI.
- Discount application UI (permission-gated, shows only what the current user is authorized to apply).
- Receipt view/print-preview.
- Returns/refund screens (find original sale, select items, capture reason, authorize, complete).

## Security Requirements

- Sale creation, discount application, return, and refund are all permission-checked (`sales.create`, `sales.cancel`, `discount.apply`, `discount.override`, `refund.approve`, etc.) via the Milestone 03 guard.
- Refund authorization is a distinct, auditable step from refund initiation — the initiating user and authorizing user may be the same person only where policy allows it (per Milestone 05's configuration), and this is enforced server-side, not just hidden in the UI.
- Every sale, return, and refund produces an audit log entry sufficient to reconstruct exactly what happened.
- No client-supplied price, discount, or tax value is trusted — all calculations are re-derived server-side from Milestone 06's pricing engine and Milestone 05's configuration, regardless of what the client UI displayed.

## Testing Requirements

- Unit tests: discount/tax/service-charge/total calculation functions, covering the documented calculation order and edge cases (zero-quantity, maximum discount, disabled service charge, etc.).
- Integration tests: full sale creation flow against a real test database, including inventory deduction and audit-event creation.
- Concurrency tests: simulated concurrent sale attempts against the same low-stock product correctly allow only the sales that can be fulfilled and reject the rest — this is the underlying business-logic coverage required in place of a dedicated "POS transaction test" category, per `docs/PRD.md` §44.
- Idempotency tests: a retried request with the same idempotency key does not create a second sale.
- Return/refund tests: a return correctly reverses inventory; a refund without proper authorization is rejected; the original sale remains unmodified in both cases.
- Authorization tests: sale/discount/refund actions blocked for unauthorized users, server-side and via RLS.

## CI/CD Requirements

- Extend the pipeline with this milestone's full test suite, including the concurrency and idempotency tests run against a real disposable database.
- Given this milestone's centrality, treat any red test here as a merge-blocking failure with no exceptions.

## Observability

- Structured logging around sale failures (stock validation failure, payment recording failure, rollback events) to aid rapid debugging of a live POS issue.
- Audit log is the compliance record; application logs are for operational debugging — both are populated, kept distinct, per the pattern established in Milestone 03.

## Deliverables

- Working POS checkout flow, cart to receipt, for all supported payment methods.
- Atomic, concurrency-safe, idempotent sale creation.
- Working returns and refunds referencing original sales, using the same engine.
- Shared calculation module reused by checkout, receipts, and (later) reporting.

## Acceptance Criteria

- [ ] A cashier can complete a sale end-to-end (search/scan → cart → discount/tax/service-charge → payment → receipt) without leaving the POS screen for the common case.
- [ ] A completed sale cannot be edited or deleted through any code path.
- [ ] Concurrent sale attempts against limited stock never oversell, verified by an automated concurrency test.
- [ ] A retried sale submission with the same idempotency key does not create a duplicate sale.
- [ ] Returns correctly reverse inventory and reference the original sale; refunds require authorization and are fully audited.
- [ ] No client-supplied price/discount/tax value is trusted without server-side re-derivation.
- [ ] All actions in this milestone are permission-checked and audited.

## Definition of Done

All acceptance criteria pass, the concurrency and idempotency test suites are green in CI, and a manual walkthrough confirms a full sale-return-refund cycle produces a correct, immutable, fully-audited trail of records with no direct edits to the original sale at any point.

## Implementation Notes

- Do not build a separate "returns engine" or "refunds engine" — they are Server Actions within this same milestone, operating on the same sale/inventory/audit primitives, per the caution against duplicating the transaction engine.
- Store-credit-as-payment-method only deducts from an existing balance here; the ledger that maintains that balance belongs to Milestone 09 and must be built (or at least stubbed with its ledger contract defined) before this milestone's store-credit payment path can be fully tested end-to-end — coordinate sequencing accordingly during implementation (a minimal store-credit-balance read/deduct contract can be stubbed here and reconciled with Milestone 09).

## Risks

- This is the single highest-risk milestone in the project — a concurrency or idempotency bug here directly causes financial/inventory discrepancies in production. Budget proportionally more review and testing time here than any other milestone.
- Calculation-order ambiguity (discount before or after tax) must be resolved and documented explicitly during implementation, not left ambiguous, since it's both a financial-correctness and a tax-compliance concern.

## Future Considerations

- Split payments, mobile payment, and gift cards are explicitly excluded from MVP (`docs/PRD.md` §17) — the payment-recording schema should not need a structural rewrite to add them later, since `payments` is already a distinct table from `sales`.
