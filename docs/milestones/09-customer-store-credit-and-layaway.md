# Milestone 09 — Customer Management, Store Credit & Layaway

## Status

Planned

## Objective

Build the unified customer domain: customer records, the store-credit ledger, and the layaway/installment ledger — modeled and delivered together as one coherent domain rather than three separate features, since both store credit and layaway are customer-attached, ledger-based financial mechanisms that share the same underlying pattern.

## Why This Milestone Exists

`docs/PRD.md` §22–24 and `docs/TAS.md` §21–22 group Customers, Store Credit, and Layaway together, and both financial mechanisms are explicitly required to be ledger-based (never a single mutable balance field) for the same auditability reason transactions must be immutable. Treating these as one milestone avoids the risk of two near-identical, subtly-inconsistent ledger implementations being built separately — the exact kind of duplication the project's quality bar warns against.

## Dependencies

- Milestone 08 (a customer's store credit can be issued via a refund, and can be consumed as a payment method at checkout — the POS engine must already exist for full integration testing, though this milestone's ledger and customer-management pieces can be built in parallel with Milestone 08's later stages if needed).

## Scope

- Customer CRUD: creation, editing, search, identification (phone/email/name), business-wide (not branch-scoped — a customer record is shared across the organization's branches, per `docs/Business_Structure_Branche.md` §24.42's "business-wide customers ✅").
- Customer transaction history (sales, returns, store-credit activity, layaway activity — read view aggregating records from Milestone 08 and this milestone's own ledgers).
- Store-credit ledger: issuance, usage (deduction at POS checkout), refund-to-credit, balance derivation from ledger entries (never a bare `customer.store_credit = X` field), per `docs/TAS.md` §21.
- Layaway ledger: customer, items, original total, outstanding balance, installment payment history, completion status, each payment immutable, per `docs/TAS.md` §22.
- Reconciling the store-credit stub consumed by Milestone 08's checkout payment path with this milestone's full ledger implementation.

## Out of Scope

- Customer loyalty, membership tiers, customer groups, customer preferences — explicitly excluded (`docs/PRD.md` §24).
- Reporting/analytics on customer data (Milestone 10 — this milestone produces the underlying ledger data).
- POS checkout UI itself (Milestone 08) — this milestone's ledgers are consumed by, not built into, checkout.

## Functional Requirements

- A customer can be created, edited, searched, and identified consistently across all of the organization's branches.
- Store-credit balance is always derived by summing ledger entries, never stored/updated as a single mutable number.
- Store credit can be issued (e.g., from a refund), used as a POS payment method (deducting via a ledger entry, not a direct balance edit), and its full history is viewable per customer.
- A layaway can be created against a customer for a set of items and an original total; partial payments reduce the outstanding balance; the layaway is marked complete only when the outstanding balance reaches zero.
- Each layaway payment is an immutable record; correcting a mistaken payment happens via a new ledger entry, never an edit to the original.
- Attempting to use more store credit than a customer's derived balance allows is rejected.

## Technical Requirements

- Both ledgers (`store_credit_ledger`, `layaway_payments`) are append-only tables; balance/outstanding-amount is always computed via a shared query/function, not cached in a way that can drift from the ledger (a cached summary column is acceptable only if it's provably kept in sync transactionally with every ledger insert — decided during implementation, but the ledger remains the source of truth either way).
- Store-credit deduction at POS checkout and store-credit issuance from a refund both go through the same shared ledger-write function used here, avoiding a second, inconsistent implementation inside Milestone 08.

## Database Changes

- New tables: `customers`, `store_credit_ledger`, `layaways`, `layaway_items`, `layaway_payments`.
- Foreign keys linking store-credit/layaway records to `customers`, and where relevant, to originating `sales`/`refunds` records from Milestone 08.

## API / Backend Changes

- Server Actions/queries: customer CRUD and search; store-credit issue/use/refund-to-credit and balance query; layaway create/record-payment/query.
- Shared ledger-write functions, exported for Milestone 08's checkout to call for store-credit deduction and for refund flows to call for store-credit issuance.

## Frontend Changes

- Customer list/search/detail screens (Admin Dashboard).
- Customer creation/edit form, reusable as a quick-add flow from the POS screen (for a cashier attaching a customer to a sale).
- Store-credit issue/view screens, balance display.
- Layaway creation screen (select customer, items, capture original total), payment-recording screen, outstanding-balance/status display.

## Security Requirements

- Customer, store-credit, and layaway mutations are permission-checked (`customers.create`, `customers.update`, and equivalent store-credit/layaway permissions) via the Milestone 03 guard; RLS scopes access appropriately (business-wide, per the customer model, rather than branch-restricted).
- Store-credit issuance and layaway creation are auditable, sensitive operations — every ledger entry records the initiating user.

## Testing Requirements

- Unit tests: balance-derivation logic for both ledgers, including edge cases (zero balance, exact-balance usage, overdraw attempt rejected).
- Integration tests: issuing store credit via a refund and later spending it at checkout produces a consistent, correct ledger trail; a layaway progressing through multiple partial payments to completion behaves correctly.
- Concurrency test: two simultaneous attempts to spend the same customer's store credit do not allow spending more than the available balance (same rigor as Milestone 07/08's concurrency tests).
- Authorization tests: unauthorized users cannot issue store credit, record layaway payments, or view another organization's customer data.

## CI/CD Requirements

- Extend the pipeline with this milestone's test suites, including the concurrency test against a real disposable database.

## Observability

- Audit log entries for customer creation/edits, store-credit issuance/usage, and layaway creation/payments.

## Deliverables

- Full customer management (CRUD, search, transaction history view).
- Working, ledger-based store-credit system.
- Working, ledger-based layaway system with installment tracking.
- Shared ledger-write functions ready for Milestone 08's checkout integration (and any remaining reconciliation with Milestone 08's earlier stub).

## Acceptance Criteria

- [ ] A customer record is shared correctly across all branches of the organization.
- [ ] Store-credit balance is always correctly derived from ledger entries; no code path writes a bare balance value.
- [ ] Store credit can be issued, spent at checkout, and its full history reviewed.
- [ ] A layaway progresses correctly from creation through partial payments to completion, with every payment immutable.
- [ ] Overdraw of store credit is rejected, including under concurrent access.
- [ ] All mutations are permission-checked and audited.

## Definition of Done

All acceptance criteria pass, Milestone 08's store-credit checkout stub is reconciled to call this milestone's real ledger functions with no duplicated logic remaining, and a manual walkthrough of "issue credit via refund → spend at checkout → review customer history" produces a fully consistent, auditable trail.

## Implementation Notes

- Resist adding customer loyalty/tiering fields "just in case" — explicitly out of scope per `docs/PRD.md` §24, and adding unused fields now creates confusion about what the product actually does.
- If Milestone 08 was built with a store-credit stub, this milestone's implementation work explicitly includes replacing that stub with the real ledger call, not leaving two parallel implementations.

## Risks

- Ledger-balance drift (a cached summary column falling out of sync with the underlying ledger) is the main technical risk — if a cached balance is used for performance, it must be updated within the same database transaction as the ledger insert, never in a separate, best-effort step.

## Future Considerations

- Loyalty/membership features, if ever added post-MVP, would naturally extend the `customers` table without disrupting the ledger-based store-credit/layaway model built here.
