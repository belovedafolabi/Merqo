# Milestone 04 — Design System & Application Shell

## Status

Complete — merged via [PR #9](https://github.com/belovedafolabi/Merqo/pull/9) (2026-08-22), with a follow-up fix in [PR #10](https://github.com/belovedafolabi/Merqo/pull/10) (2026-08-23)

## Objective

Establish the shared visual and structural foundation every later screen is built on: design tokens, a neutral black/white SaaS base with a configurable per-organization branding layer, the shadcn/ui component library, the two distinct application shells (data-dense Admin Dashboard vs. speed-optimized POS interface), and responsive layout rules — before any feature screens exist, so no later milestone invents its own inconsistent styling.

## Why This Milestone Exists

The project requires a UI that "combines a modern SaaS dashboard with an extremely fast POS interface" with per-business configurable branding, and `docs/UXUI_Design_System_Specification.md` and `docs/TAS.md` §41–43 are explicit that these are *not* the same layout: the POS prioritizes speed and minimal navigation, the Admin Dashboard prioritizes information density. Building this once, centrally, prevents every feature milestone (05 onward) from re-deriving spacing/color/component decisions ad hoc, and prevents branding from being retrofitted into components that weren't built to support it.

## Dependencies

- Milestone 01 (Tailwind/shadcn installed).
- Milestone 03 (authenticated shell needs a real session to gate the Admin/POS shells; the sign-in screens built in Milestone 03 get restyled here rather than duplicated).

## Scope

- Design tokens: color scale (neutral black/white base), typography scale, spacing scale, radii, shadows — defined once as CSS variables/Tailwind theme config.
- Branding layer mechanism: per-organization primary color, secondary color, logo, brand name, applied as a CSS-variable override layer on top of the neutral base (schema for storing these values is added here; the *management UI* for editing them is Milestone 11).
- Accessibility guardrails: minimum contrast enforcement on any user-supplied brand color (e.g., computed contrast check with a safe fallback), per `docs/PRD.md` §31/`docs/TAS.md` §43.
- shadcn/ui component installation and any light customization needed to fit the token system (buttons, inputs, dialogs, tables, cards, tabs, toasts, etc. — installed as needed, not the entire catalog speculatively).
- Two distinct application shells:
  - **Admin Dashboard shell:** sidebar/topbar navigation, information-dense layout, supports the eventual Business Structure/Product/Inventory/Reporting/Administration screens.
  - **POS shell:** minimal-navigation, large-touch-target layout supporting the eventual cart/checkout screen (per `docs/TAS.md` §41's search/categories/cart/total layout), optimized for keyboard/barcode-scanner input and fast interaction.
- Responsive breakpoints for desktop, laptop, tablet, and phone, with an explicit note (per `docs/TAS.md` §42) that responsive does not mean visually identical at every breakpoint — POS layout adapts to preserve speed, not just reflow.
- Loading, empty, and error state patterns defined once (skeletons, empty-state components, error boundaries) for reuse everywhere.

## Out of Scope

- Any feature-specific screen content (Business Structure CRUD is Milestone 05, Product Catalog UI is Milestone 06, etc.) — this milestone builds the shell and the component/token library, not feature pages.
- Branding *management* UI (Milestone 11) — this milestone only builds the mechanism that renders branding values, and the schema/columns to store them.
- Receipt template design (Milestone 11).
- Hardware-specific UX (barcode scanner focus-trapping, printer output styling) — Milestone 14.

## Functional Requirements

- Every later screen can be built using only the token system and shared shadcn/ui components — no later milestone should need to define new base colors, spacing values, or typography sizes.
- Switching an organization's branding values immediately reflects across the Admin Dashboard and POS shells without a code change.
- The Admin Dashboard and POS shells are visually distinct but share the same underlying token system (so branding applies consistently to both).
- All interactive components meet WCAG AA contrast minimums against the neutral base; brand color overrides that would fail contrast fall back to a safe default with a warning surfaced to the Owner/Admin (implemented fully once Milestone 11 builds the editing UI — this milestone builds the contrast-check utility itself).

## Technical Requirements

- Tailwind CSS theme extended via CSS custom properties so branding can be swapped at runtime (per-organization) without a rebuild.
- shadcn/ui components installed via its CLI (copied into the repo, not an opaque npm dependency, per shadcn's own model) and customized minimally to consume the token system.
- Layout implemented with Next.js route groups/layouts so the Admin Dashboard shell and POS shell are structurally separate route trees sharing the same design tokens.
- No CSS-in-JS runtime library introduced (Tailwind + CSS variables is sufficient and keeps bundle size/cost down).

## Database Changes

- New columns/table: organization branding fields (`primary_color`, `secondary_color`, `logo_url`, `brand_name`) — likely a `branding` table or columns on `organizations`, decided during implementation; values are placeholders/defaults for now (real editing UI is Milestone 11).

## API / Backend Changes

- A minimal Server Action/query to read an organization's branding values for rendering (write path deferred to Milestone 11).

## Frontend Changes

- Design token definitions (Tailwind config + CSS variables).
- shadcn/ui component set installed and themed.
- Admin Dashboard shell (navigation shell, content area, responsive collapse behavior).
- POS shell (minimal-nav, large-touch-target layout).
- Shared loading/empty/error state components.
- Milestone 03's sign-in/sign-up/reset screens restyled to use the new token system and components (no new functionality, just visual integration).

## Security Requirements

- Logo upload path (if implemented here versus deferred fully to Milestone 11) uses Supabase Storage with organization-scoped access rules — no logo/branding asset readable across organizations by URL guessing (signed/scoped URLs or RLS-backed storage policies).
- No new authorization surface beyond what Milestone 03 established; this milestone consumes the existing session/permission context, it does not introduce new permission checks.

## Testing Requirements

- Component tests: shared components (buttons, inputs, cards, etc.) render correctly and meet accessibility basics (e.g., automated axe-core checks in CI).
- Visual/responsive tests: at minimum, Playwright checks that the Admin shell and POS shell each render correctly at desktop, tablet, and mobile viewport widths.
- Contrast utility unit tests: given a set of brand colors, the contrast-check utility correctly flags failing combinations and falls back safely.

## CI/CD Requirements

- Extend the pipeline with the accessibility check (axe-core or equivalent) and the new component/responsive tests.
- No new deployment infrastructure required — reuses Milestone 01's Vercel pipeline.

## Observability

- No new logging beyond Milestone 01/03's conventions; UI rendering errors are caught by a shared error boundary component and logged consistently.

## Deliverables

- Complete design token system (colors, typography, spacing) as reusable Tailwind/CSS-variable config.
- Installed and themed shadcn/ui component set.
- Two working, empty (no feature content) application shells: Admin Dashboard and POS.
- Branding override mechanism (schema + render-time application), ready for Milestone 11 to attach an editing UI to.
- Restyled auth screens from Milestone 03.

## Acceptance Criteria

- [ ] A later milestone's screen can be built entirely from the existing component/token library without new base styles.
- [ ] Admin Dashboard and POS shells render correctly and distinctly at desktop, tablet, and mobile breakpoints.
- [ ] Changing an organization's branding values changes rendered colors/logo across both shells without a deploy.
- [ ] Automated accessibility checks pass in CI for the shared component set.
- [ ] Contrast fallback logic is unit-tested and demonstrably prevents an inaccessible brand-color combination from being applied.

## Definition of Done

All acceptance criteria pass, a short internal style guide (Storybook is optional/likely unnecessary given cost constraints — a markdown component catalog is sufficient) documents the available components/tokens for later milestones, and the auth screens from Milestone 03 visually reflect the new system end-to-end.

## Implementation Notes

- Do not introduce Storybook or a separate design-tooling service unless it earns its keep — a markdown/MDX catalog page within the app itself (dev-only route) is enough and avoids extra infrastructure/cost.
- Keep the branding override mechanism intentionally simple (four fields: two colors, logo, brand name) — resist expanding it speculatively; per Stage 24's decision table, branch-specific branding is explicitly out of scope for MVP (organization-level branding only).

## Risks

- Building feature screens before this milestone lands would fragment the visual language across the app — this milestone must land before Milestone 05 begins any real screen work.
- Overly aggressive brand-color contrast fallback could frustrate legitimate business branding choices — tune the threshold conservatively and surface a clear warning rather than silently overriding wherever feasible.

## Future Considerations

- Branch-specific branding is out of scope for MVP (per Stage 24) but the CSS-variable override mechanism built here would extend to a branch-level override without a structural rewrite if that decision changes later.
