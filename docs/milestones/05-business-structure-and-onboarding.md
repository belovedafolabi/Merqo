# Milestone 05 — Business Structure Management & Onboarding

## Status

Complete — merged via [PR #11](https://github.com/belovedafolabi/Merqo/pull/11) (2026-08-23)

## Objective

Build the screens and Server Actions that let an Owner/Admin actually create and manage their Organization's structure — branches, business units, business-type selection, and per-business-unit POS configuration (tax rate, service charge, discount policy, default payment method) — culminating in a working onboarding flow that takes a brand-new signup all the way to "ready to add products."

## Why This Milestone Exists

Milestones 02–04 built the schema, authorization, and design system; this is the first milestone where a real user can actually configure their business. It operationalizes the Organization → Branch → Business Unit hierarchy and the Business Type → Capability defaulting mechanism as an actual product experience, and it is the dependency every later feature milestone needs (Products need a Business Unit to belong to; Inventory needs a Branch; POS needs Business Unit configuration like tax/service-charge rates to calculate a sale).

## Dependencies

- Milestone 02 (hierarchy schema, capability catalog).
- Milestone 03 (authorization — only Owner/Admin-permitted actions can create/edit business structure).
- Milestone 04 (Admin Dashboard shell and components).

## Scope

- Onboarding wizard: business-type selection → organization details → first branch → first business unit → capability review/confirmation (defaults from business type, with override) → "start adding products" hand-off (per `docs/PRD.md` §49's success-criteria flow).
- Branch management: create/edit/archive branches.
- Business Unit management: create/edit/archive business units within a branch, business-type assignment, capability toggle overrides.
- Business Unit POS configuration: tax rate, service charge (percentage or fixed, enable/disable), discount policy (who can discount, max percentage/amount, whether authorization is required, reason requirement), default payment method — stored here so Milestone 08's POS engine can simply read it rather than each feature milestone inventing its own settings storage.
- Multi-business-type support per organization (an organization can operate business units of different types, per `docs/PRD.md`).

## Out of Scope

- Product/category/pricing management (Milestone 06).
- Inventory management and stock transfers (Milestone 07).
- Employee invite/custom-role builder UI (Milestone 11 — this milestone's onboarding creates only the initial Owner/Admin user, already handled by Milestone 03's signup flow).
- Branding editing UI (Milestone 11 — Milestone 04 built the mechanism; the settings screen to edit it belongs with Administration).
- Receipt template configuration (Milestone 11).

## Functional Requirements

- A new signup can complete the onboarding wizard end-to-end and land on a state where at least one Branch and one Business Unit exist, correctly typed and capability-configured.
- An Owner/Admin (or any user with the relevant permission) can create additional branches and business units after onboarding, from the Admin Dashboard.
- Selecting a Business Type pre-fills capability defaults (per `docs/TAS.md` §8), and the Owner/Admin can override individual capabilities before or after creation.
- Business Unit POS configuration (tax rate, service charge, discount policy, default payment method) is editable and validated (e.g., tax/service-charge percentages within sane bounds, discount limits are non-negative and internally consistent).
- Archiving a Branch or Business Unit is supported; hard deletion is not exposed in the UI, matching Stage 24's locked decision.
- Every create/edit/archive action here is permission-checked via Milestone 03's guard and produces an audit log entry.

## Technical Requirements

- All mutations implemented as Next.js Server Actions calling the Milestone 03 authorization guard before touching the database.
- Form validation with Zod schemas shared between client-side form feedback and server-side enforcement (never trust client validation alone).
- Optimistic UI patterns (via TanStack Query or Next.js's built-in mutation/revalidation patterns) for a responsive onboarding experience without introducing unnecessary client-state complexity.

## Database Changes

- New tables/columns: `business_unit_pos_config` (or equivalent columns on `business_units`) storing tax rate, service charge configuration, discount policy fields, default payment method.
- Any onboarding-progress tracking needed (e.g., an `onboarding_completed_at` column on `organizations`) to resume an incomplete wizard.

## API / Backend Changes

- Server Actions: create/update/archive Organization details, Branch, Business Unit; update Business Unit capability overrides; update Business Unit POS configuration; complete-onboarding action.
- Read queries: list branches/business units for the current organization, scoped by RLS and the authorization layer.

## Frontend Changes

- Onboarding wizard (multi-step form flow) built on the Admin Dashboard shell/components from Milestone 04.
- Branch management screen (list, create, edit, archive).
- Business Unit management screen (list, create, edit, archive, capability toggles, POS configuration form).
- Business-type picker component (reusable across onboarding and later business-unit creation).

## Security Requirements

- Only users with the appropriate permission (e.g., `organization.manage`, `branch.create`, `business_unit.create`) can perform these actions — enforced server-side, verified by RLS as the second boundary, per Milestone 03's established pattern.
- Discount-policy configuration itself is a sensitive setting (it governs how much revenue leakage is possible at checkout) — restricted to Owner/Admin-level permissions by default, auditable on every change.
- Input validation on all numeric configuration fields (tax rate, service charge, discount limits) to prevent nonsensical or exploitable values (e.g., negative tax, >100% discount without explicit intent).

## Testing Requirements

- Integration tests: full onboarding wizard flow from signup through first Business Unit creation, asserting the resulting database state matches expectations.
- Authorization tests: a user without the relevant permission cannot create/edit/archive a branch or business unit (Server Action layer and RLS both verified, per the Milestone 03 pattern).
- Validation tests: invalid POS configuration values (negative tax rate, malformed discount policy) are rejected server-side even if a malicious client bypasses the form.
- Capability-default tests: selecting a given Business Type produces the correct default capability set; overriding a capability persists correctly.

## CI/CD Requirements

- Extend the existing pipeline with this milestone's integration/authorization/validation test suites — no new pipeline infrastructure needed.

## Observability

- Audit log entries for every business-structure mutation (branch created, business unit archived, POS configuration changed, etc.), using the Milestone 03 `recordAuditEvent()` helper.
- Structured logging for onboarding funnel steps (which step a user is on) to aid future troubleshooting of stuck onboarding — no external analytics service required.

## Deliverables

- Working onboarding wizard.
- Branch and Business Unit management screens.
- Business Unit POS configuration screen (tax/service-charge/discount/default-payment-method), consumable by Milestone 08.
- Business-type picker with capability-default preview.

## Acceptance Criteria

- [ ] A new organization can complete onboarding end-to-end and reach a state ready for product entry.
- [ ] Branches and Business Units can be created, edited, and archived from the Admin Dashboard after onboarding.
- [ ] Business-type selection correctly pre-fills capability defaults, and overrides persist.
- [ ] Business Unit POS configuration (tax, service charge, discount policy, default payment method) is stored and readable by other parts of the system.
- [ ] Unauthorized users are blocked from all mutations in this milestone, verified server-side and via RLS.
- [ ] All mutations produce audit log entries.

## Definition of Done

All acceptance criteria pass, a fresh test organization can be onboarded through the UI (not just via seed scripts) and have a fully configured Business Unit ready for Milestone 06's product entry, and no business-type-specific logic exists anywhere in the codebase outside the capability-default seed data.

## Implementation Notes

- Keep the onboarding wizard resumable (a user who closes the tab mid-way can pick up where they left off) — avoids a frustrating first-run experience without requiring a complex saga/workflow engine.
- The discount-policy fields modeled here are consumed, not re-derived, by Milestone 08's checkout calculation — do not duplicate this configuration storage there.

## Risks

- If Business Unit POS configuration is modeled too rigidly (e.g., a single flat tax rate field) it may not accommodate a legitimate future need; keep the schema simple per MVP scope (multiple simultaneous tax rates explicitly not required per `docs/PRD.md` §19) but don't paint the schema into an unnecessary corner — a single configurable rate is sufficient for now.

## Future Considerations

- Branch-specific branding and business-unit-to-business-unit transfers remain out of MVP scope (Stage 24) — this milestone's data model should not need to change if those are revisited later, since branches and business units are already first-class, independently addressable entities.
