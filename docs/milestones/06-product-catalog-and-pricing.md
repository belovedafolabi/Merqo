# Milestone 06 — Product Catalog & Pricing Engine

## Status

Complete — merged via [PR #14](https://github.com/belovedafolabi/Merqo/pull/14) (2026-08-23)

## Objective

Build the product engine: products, categories, variants, barcodes/SKUs scoped to a single Business Unit, and the branch-level pricing override model (`Product Base Price → Branch Price Override → POS Selling Price`) with price history and the transaction-time price-snapshot mechanism that later protects sale-record immutability.

## Why This Milestone Exists

Products are the second of `docs/TAS.md` §55's three expensive-to-reverse areas (alongside schema and the transaction engine), and pricing is where the branch-owned-inventory decision (`DECISIONS_AND_CONFLICTS.md` §2) and the one-product-per-business-unit decision (§3) become concrete: this milestone is where those decisions get implemented as real product/pricing records, ahead of Inventory (Milestone 07) and the POS engine (Milestone 08) that both depend on a correct product model.

## Dependencies

- Milestone 05 (Business Units must exist for products to belong to; Business Unit POS configuration exists for later consumption).

## Scope

- Product CRUD: name, SKU, barcode, description, category, images (via Supabase Storage), unit of measurement, cost price, base/default selling price, status (active/archived), scoped to exactly one Business Unit (per `DECISIONS_AND_CONFLICTS.md` §3).
- Category management (simple, hierarchical or flat — flat is sufficient for MVP; avoid over-building a nested-category system unless a concrete need emerges).
- Product variants (e.g., size/color) sharing a parent product's identity but with their own SKU/barcode/stock identity.
- Database-level uniqueness: `UNIQUE(business_unit_id, sku)`, `UNIQUE(business_unit_id, barcode)` (per `docs/TAS.md` §11), enforced exactly as scoped in Milestone 02's schema design.
- Branch-level pricing: a product has a base price; each branch where that Business Unit type operates can override it (`docs/Product_Catalog_and_Pricing_Architecture.md` §20.4 — note that because a product belongs to exactly one Business Unit which belongs to exactly one Branch, in practice branch-level override applies within the product's own branch context and to the "same product concept re-created in another branch" pattern from Decision #3's refinement).
- Price history: every price change recorded, not overwritten in place.
- Transaction-time price snapshot mechanism: the *mechanism* (a reusable "resolve current effective price and snapshot it" function) is built here; it is consumed by Milestone 08's checkout, not duplicated there.
- Product search: barcode exact-match lookup and general product search, built on plain PostgreSQL indexes (no Elasticsearch/Algolia, per `docs/TAS.md` §36).

## Out of Scope

- Inventory balances/stock levels (Milestone 07) — this milestone establishes what a product *is*, not how many are in stock.
- Stock transfers (Milestone 07).
- POS/checkout UI (Milestone 08) — this milestone builds the data and pricing engine the checkout will read from.
- Batch/expiry tracking (Milestone 07 — inventory-specific, not product-identity-specific, even though it's often discussed alongside pharmacy products).

## Functional Requirements

- A product belongs to exactly one Business Unit; the same product cannot be created under multiple Business Units (database-enforced, per Decision #3).
- SKU and barcode are unique within a Business Unit, not globally.
- A product has a base price; if a branch-level override exists for that product's context, the override takes precedence for POS selling price resolution.
- Price changes are recorded in a price-history table; the current effective price is always derivable, and past prices remain queryable for reporting/auditing.
- Barcode lookup returns a match (or a clear "not found") fast enough to support POS scanning speed requirements (validated with an indexed exact-match query).
- Product archiving (not hard deletion) removes a product from active POS use while preserving historical sale references to it.

## Technical Requirements

- Indexes: on `(business_unit_id, sku)`, `(business_unit_id, barcode)`, and any full-text/trigram index needed for general product search (PostgreSQL `pg_trgm` is sufficient — no external search service).
- Price resolution implemented as a single, shared server-side function (`resolveEffectivePrice(productId, branchId)`), so every future consumer (POS checkout, reports, receipts) gets identical pricing logic — never duplicated per-caller.
- Image storage via Supabase Storage, organized per `docs/TAS.md` §35's `organizations/{organization_id}/products/` convention, with organization-scoped access rules.

## Database Changes

- New tables: `products`, `product_variants`, `categories`, `product_prices` (history), `branch_price_overrides` (or an equivalent modeling of the base→override precedence).
- Constraints: business-unit-scoped uniqueness on SKU/barcode; foreign keys to `business_units`, `categories`.

## API / Backend Changes

- Server Actions/queries: product CRUD, category CRUD, variant CRUD, price update (writes to history, never overwrites), barcode lookup, product search.
- Shared `resolveEffectivePrice()` function, exported for reuse by Milestone 08 and Milestone 10 (reporting).

## Frontend Changes

- Product list/grid (Admin Dashboard) with search, filter by category, status.
- Product create/edit form (name, SKU, barcode, category, images, unit, cost, base price, variants).
- Category management screen.
- Price history view on a product's detail page.
- Branch price override management (where the Business Unit's product context has more than one relevant branch pricing scenario — kept simple per MVP scope).

## Security Requirements

- Product mutations permission-checked (`products.create`, `products.update`, `products.archive`) via the Milestone 03 guard; RLS scopes product visibility/mutation to the user's authorized business unit(s).
- Cost price is a sensitive field — visible only to users with an appropriate permission (e.g., not exposed to a Cashier role by default), enforced server-side and reflected in the frontend via the permission-aware component from Milestone 04.
- Image uploads validated (file type/size) before storage to prevent abuse of the storage bucket.

## Testing Requirements

- Unit tests: `resolveEffectivePrice()` correctness (base price, override present, override absent, historical price at a given point in time for reporting).
- Integration tests: product CRUD respects business-unit scoping and uniqueness constraints; attempting to create a duplicate SKU/barcode within the same business unit fails; the same SKU across different business units succeeds.
- Authorization tests: cost price hidden from unauthorized roles; product mutation blocked for unauthorized users, server-side and via RLS.
- Search/performance sanity test: barcode lookup returns correct results using the index (not a full table scan) on a seeded dataset of realistic size.

## CI/CD Requirements

- Extend the pipeline with this milestone's test suites; no new infrastructure.

## Observability

- Audit log entries for product creation, edits (especially price changes), and archiving.
- Structured logging for barcode-lookup misses (helps identify data-entry issues later) without introducing an analytics service.

## Deliverables

- Full product/category/variant CRUD.
- Working branch-level pricing model with price history.
- Shared price-resolution function ready for Milestone 08 to consume.
- Barcode/product search backed by proper indexes.

## Acceptance Criteria

- [ ] A product cannot be created under more than one Business Unit.
- [ ] SKU/barcode uniqueness is enforced within a Business Unit, not globally.
- [ ] Price changes are recorded in history and the current effective price is always correctly resolved.
- [ ] Barcode lookup returns correct, fast results against seeded data.
- [ ] Cost price is hidden from unauthorized roles.
- [ ] All mutations are permission-checked and audited.

## Definition of Done

All acceptance criteria pass, `resolveEffectivePrice()` is documented and demonstrably reused (not reimplemented) when Milestone 08 is built, and a manual test confirms archiving a product does not break historical sale records (verified once Milestone 08 exists, tracked here as a forward-compatibility note).

## Implementation Notes

- Keep category modeling flat/simple for MVP; a nested category tree adds complexity `docs/PRD.md` doesn't call for.
- Multiple simultaneous tax rates are explicitly not required for MVP (`docs/PRD.md` §19) — pricing here only concerns product price, not tax, which lives in Milestone 05's Business Unit configuration and is applied at checkout in Milestone 08.

## Risks

- Getting price-snapshot-at-sale-time wrong would let a later price change silently rewrite historical sale totals, violating transaction immutability — the shared resolution function and its tests are the safeguard; Milestone 08 must snapshot the resolved price into the sale record, not a live reference to the product's current price.

## Future Considerations

- If a genuine need for multiple simultaneous tax rates or more complex pricing tiers emerges post-MVP, the `product_prices`/`branch_price_overrides` structure here can be extended without redesigning the product-identity model.
