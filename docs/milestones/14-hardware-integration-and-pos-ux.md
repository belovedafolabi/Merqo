# Milestone 14 — Hardware Integration & POS UX Refinement

## Status

Planned

## Objective

Integrate the physical hardware the POS is expected to support — barcode scanners, receipt printers, customer-facing displays, tablets, and phones — and refine the POS UX/performance for real device usage, building on the fully working transactional engine from Milestone 08.

## Why This Milestone Exists

`docs/PRD.md` §41 requires initial hardware compatibility (barcode scanners, receipt printers, customer displays, tablets, phones) on a Responsive Web platform, avoiding proprietary dependencies where possible. This is sequenced after the POS Transaction Engine (Milestone 08) deliberately: hardware integration is about *how input reaches* and *output leaves* an already-correct, already-tested checkout flow, not a prerequisite for it — building hardware support against an unstable transaction engine would mean redoing this work.

## Dependencies

- Milestone 08 (POS Transaction Engine — cart, checkout, receipt data model).
- Milestone 04 (POS shell/responsive layout foundation this milestone tunes for real devices).

## Scope

- Barcode scanner input: most USB/Bluetooth barcode scanners emulate keyboard input, so this is primarily about correct focus management and fast-input handling in the POS cart/search UI (capturing rapid keystroke-then-Enter sequences reliably, distinguishing scanner input from manual typing) rather than a proprietary hardware SDK integration.
- Receipt printer output: browser-based printing (styled print stylesheet for the receipt view built in Milestone 08) as the baseline, avoiding proprietary print-server dependencies where possible, per `docs/PRD.md` §41's explicit guidance.
- Customer-facing display: a secondary, read-only view of the current cart/total (e.g., a second browser window/tab or a dedicated route intended for a customer-facing screen), no proprietary display SDK required.
- Tablet and phone optimization: a dedicated pass tuning the POS shell (from Milestone 04) for touch-target sizing, on-screen keyboard behavior, and layout at those breakpoints specifically for the checkout flow (Milestone 04 established general responsive rules; this milestone validates and refines them against the actual POS screen under real device constraints).
- POS performance tuning: profiling and optimizing the priority interaction areas explicitly called out in `docs/PRD.md` §42 (barcode scanning, product search, cart operations, quantity updates, checkout, payment selection, receipt generation).

## Out of Scope

- Any new transactional logic (Milestone 08 already owns checkout/sale correctness) — this milestone only changes how input/output reaches that logic and how it performs/renders.
- Native mobile apps — the platform remains Responsive Web only, per `docs/PRD.md` §41.
- Proprietary hardware vendor SDK integrations beyond what's needed for the standard-input (keyboard-emulating scanner) and browser-print (printer) approaches — if a specific piece of hardware genuinely requires a proprietary SDK, that's flagged as a risk below, not silently built.

## Functional Requirements

- A barcode scan reliably and quickly adds the correct product to the cart, indistinguishable in correctness from a manual search-and-select, and does not misfire on normal manual keyboard use of the same screen.
- A completed sale's receipt can be printed via the browser's print flow, correctly formatted (branding, transaction details) for typical receipt-printer paper widths.
- A customer-facing display view shows the current cart and total, updating as the cashier works, without exposing anything beyond what a customer should see (no cost price, no internal notes).
- The POS checkout flow is comfortably usable on a tablet and a phone, with touch targets sized appropriately and no layout breakage.
- The priority interaction areas from `docs/PRD.md` §42 meet a documented, tested performance bar (e.g., product search results and cart updates render within a target time on realistic data volume).

## Technical Requirements

- Scanner input handled via standard DOM keyboard-event listening with a heuristic (input speed/pattern plus a terminating Enter) distinguishing scanner bursts from manual typing — no vendor-specific WebHID/WebUSB integration unless a concrete, named piece of hardware requires it (decided during implementation, not assumed upfront).
- Print output uses a dedicated print stylesheet (`@media print`) applied to the existing receipt view/data model from Milestone 08, not a separate receipt-rendering implementation.
- Customer-facing display reuses the existing cart/total state (e.g., via a lightweight real-time channel — Supabase Realtime is acceptable here since it's part of the already-provisioned Supabase project and this is exactly the kind of "genuine benefit" use case `docs/TAS.md` calls out, not a default dependency).
- Performance profiling uses browser devtools and Next.js's own build/runtime diagnostics — no paid APM tool introduced for this.

## Database Changes

None expected. If a customer-display "pairing" mechanism needs persistent state (e.g., linking a display session to a POS terminal), a small table may be introduced during implementation — documented here if so, otherwise this section stands as "no database changes."

## API / Backend Changes

- No new business logic; at most, a lightweight Route Handler or Realtime channel subscription supporting the customer-facing display's live cart view.

## Frontend Changes

- Scanner-aware input handling in the POS cart/search components.
- Print stylesheet for the receipt view.
- Customer-facing display route/view.
- Tablet/phone-specific layout refinements to the POS shell and checkout screen.
- Performance optimizations to the priority interaction areas (e.g., debounced search, virtualized product lists if needed for large catalogs).

## Security Requirements

- The customer-facing display view exposes only cart/total information — no authentication-bypass risk (it must not, for example, allow completing a sale or reveal any authenticated-user data) — reviewed explicitly since it's a new, less-restricted-by-design surface.
- No new authorization surface is introduced for the cashier-facing hardware features (scanner input and printing operate within the existing authenticated POS session from Milestone 08).

## Testing Requirements

- Integration tests: simulated rapid-keystroke-plus-Enter input correctly adds a product via barcode lookup (reusing Milestone 06's barcode lookup) without requiring physical scanner hardware in CI.
- Visual/print tests: the print stylesheet renders the expected receipt layout (snapshot-style test where feasible).
- Responsive tests: Playwright checks at tablet and phone viewport widths confirm the checkout flow remains fully usable (no obscured buttons, no unreachable controls).
- Performance tests: a basic benchmark/assertion (e.g., search results render under a defined threshold against a realistic seeded catalog size) added to CI as a regression guard, not just a one-time manual check.

## CI/CD Requirements

- Extend the pipeline with this milestone's responsive/visual/performance test additions.

## Observability

- Structured logging for scanner-input misfires (heuristic mismatches) during initial rollout, to help tune the detection heuristic based on real usage patterns without needing physical devices in the loop for every diagnosis.

## Deliverables

- Working barcode-scanner-aware POS input.
- Working browser-based receipt printing.
- Working customer-facing display view.
- Tablet/phone-optimized POS checkout flow.
- Performance-tuned priority interactions with a regression-guarding benchmark in CI.

## Acceptance Criteria

- [ ] Barcode scans reliably add the correct product without misfiring on normal typing.
- [ ] Receipts print correctly formatted via the browser print flow.
- [ ] The customer-facing display shows only appropriate cart/total information, live.
- [ ] The POS checkout flow is fully usable on tablet and phone viewport sizes (automated responsive tests pass).
- [ ] Priority interactions meet the documented performance bar, guarded by a CI benchmark.

## Definition of Done

All acceptance criteria pass, and a manual test session using an actual USB barcode scanner and a real receipt printer (or the closest available equivalent) confirms the browser-based, non-proprietary approach works acceptably in practice — if it does not, the gap is documented as a risk for a follow-up decision rather than silently shipped.

## Implementation Notes

- Favor the keyboard-emulation approach for scanners and browser-native printing over proprietary SDKs unless a specific, named hardware requirement forces otherwise — this keeps the platform vendor-agnostic per `docs/PRD.md` §41.
- Use Supabase Realtime narrowly, only for the customer-display use case identified here — do not let it become a default dependency for other features, per `docs/TAS.md`'s explicit caution.

## Risks

- Not all barcode scanners and receipt printers behave identically; the keyboard-emulation/browser-print approach covers the common case but may not satisfy every specific device a client already owns — this should be validated against at least one or two real, commonly available devices before being considered fully proven, and any hard incompatibility discovered should be raised rather than worked around with a rushed proprietary integration.

## Future Considerations

- If a client's specific existing hardware genuinely cannot be supported via the keyboard-emulation/browser-print approach, a targeted, named-device integration could be scoped as a small follow-up — not a reason to over-build a generic hardware abstraction layer now.
