# Milestone 15 — Security, QA & Production Hardening

## Status

Complete — audit record in [`15-audit/`](15-audit/). Seven findings (1 HIGH, 1
MEDIUM, 5 LOW), all fixed in the branch; one latent issue deferred to
Milestone 16 with a documented owner (see `15-audit/findings-and-fixes.md`
finding 2, and `DECISIONS_AND_CONFLICTS.md`).

## Objective

Perform a dedicated, cross-cutting security and quality pass across the entire system built in Milestones 01–14: a full RLS/authorization audit, secrets and rate-limiting review, completion of the regression/E2E suite, and cross-browser/responsive/hardware regression testing — closing gaps that individual feature milestones' own security/testing sections could not fully catch in isolation.

## Why This Milestone Exists

Security and testing have been mandatory, non-negotiable requirements in every milestone since Milestone 01 — this milestone is not where security or testing "begins," it is where the *system as a whole* gets reviewed, because some classes of issues (a permission gap that only appears when two features interact, a RLS policy that's individually correct but inconsistent with another table's policy, a regression introduced by a later milestone touching earlier code) are only visible once the full system exists. Per `docs/Security _Architecture_And_Authorization.md` §68 and the project's explicit instruction that security must not be treated as a late, separate afterthought, this milestone reinforces and verifies — it does not introduce security for the first time.

## Dependencies

- All feature milestones (05 through 14) — this milestone audits the complete, assembled system.

## Scope

- Full RLS policy audit: every table across every milestone reviewed for correct organization/branch/business-unit scoping, with a written checklist confirming each against `DECISIONS_AND_CONFLICTS.md`.
- Full server-side authorization audit: every Server Action/Route Handler confirmed to call the Milestone 03 authorization guard (or is explicitly, deliberately public with a documented reason).
- Secrets management review: confirm no secret has ever been committed, confirm all secrets are in Vercel's/GitHub's encrypted stores, rotate any secret that may have been exposed during development.
- Rate-limiting review and tuning across sensitive endpoints (login, webhook, checkout) beyond Milestone 03's basic login throttling.
- Input validation audit: confirm every mutation validates input server-side with Zod (or equivalent), not just client-side.
- Concurrency/idempotency regression pass: re-run and extend the concurrency test suites from Milestones 07, 08, and 09 against the fully assembled system.
- Full regression/E2E suite: end-to-end user journeys spanning multiple milestones (onboarding → product setup → inventory → a full sale → a return → a report), automated in Playwright.
- Cross-browser testing (major evergreen browsers) and responsive testing (desktop/tablet/phone) across the full application, not just the POS screens covered in Milestone 14.
- Hardware regression pass: re-verify Milestone 14's scanner/print/customer-display behavior hasn't regressed.
- Dependency vulnerability review (Dependabot alerts from Milestone 01, addressed/triaged).

## Out of Scope

- Building new features — this milestone fixes and hardens what already exists; any new feature discovered as missing during this pass is logged and routed back to the appropriate earlier milestone or a follow-up, not built ad hoc here.
- Production deployment automation/monitoring finalization (Milestone 16 — this milestone's output feeds into that one).

## Functional Requirements

- Every table's RLS policy is reviewed and confirmed correct; any gap found is fixed and covered by a new test.
- Every Server Action/Route Handler is confirmed to be permission-checked or explicitly, deliberately public.
- The full regression/E2E suite passes reliably (not flaky) in CI.
- Cross-browser and responsive testing passes across the whole application.
- No committed secret exists anywhere in git history; any that did are rotated.

## Technical Requirements

- RLS/authorization audit conducted with a written, checked-off checklist (one row per table/action), committed to the repo as a record (e.g., alongside this milestone's file or as a companion audit doc) so it's reviewable, not just verbally confirmed.
- Regression/E2E suite organized around real user journeys, not just per-feature unit tests (those already exist from each earlier milestone) — this suite specifically catches cross-milestone interaction bugs.
- Rate limiting implemented at a layer appropriate to the free-tier hosting (e.g., Vercel Edge Middleware or a lightweight in-application check) — no paid WAF/rate-limiting service introduced.

## Database Changes

None expected as new tables — this milestone may add missing indexes, tighten constraints, or fix RLS policies discovered to be incorrect during the audit, but does not introduce new domain tables.

## API / Backend Changes

- Fixes to any Server Action/Route Handler found missing a permission check during the audit.
- Rate-limiting middleware/checks added to sensitive endpoints.

## Frontend Changes

- Fixes to any cross-browser/responsive issue discovered during this milestone's testing pass.

## Security Requirements

- This milestone's entire scope *is* the security requirement — see Scope above. Additionally: a final review that Super Admin's untethered access is itself properly scoped (it should bypass subscription/business restrictions, per `docs/PRD.md` §9, but should still be authenticated and audited — "untethered" does not mean "unauthenticated" or "unaudited").
- Confirm encryption in transit (HTTPS everywhere, enforced by Vercel by default) and that encryption at rest relies correctly on Supabase's platform-level guarantees (per `docs/Security _Architecture_And_Authorization.md` §68's "Encryption at rest: Platform-supported").

## Testing Requirements

- The full regression/E2E suite described in Scope, covering multi-milestone user journeys.
- A dedicated RLS test sweep re-running every earlier milestone's RLS tests together, to catch any interaction/regression between policies added at different times.
- Cross-browser test matrix (via Playwright's multi-browser support) across the full application.
- Load/stress test of the POS concurrency path (Milestone 08) under higher simulated concurrency than earlier milestone-level tests used, to build confidence beyond the minimum case.

## CI/CD Requirements

- The full regression/E2E suite and cross-browser matrix become a required (or nightly, if execution time is a concern for the free-tier CI minutes budget) part of the pipeline going forward.
- Dependabot alerts triaged and either fixed or explicitly accepted-with-reason, documented.

## Observability

- A final review of logging/audit coverage: confirm every sensitive operation across every milestone produces an audit entry, and that application-level error logging is consistent and useful across the whole app, not just in the milestones where it was originally emphasized.

## Deliverables

- Completed RLS/authorization audit checklist, with all findings fixed.
- Full regression/E2E suite covering cross-milestone user journeys.
- Cross-browser/responsive test coverage for the whole application.
- Secrets/rate-limiting review completed, with any necessary rotations done.
- A written summary of findings and fixes (for the project owner's visibility into what this hardening pass actually caught).

## Acceptance Criteria

- [x] Every table's RLS policy is reviewed and confirmed correct against `DECISIONS_AND_CONFLICTS.md`. — [`15-audit/rls-policy-checklist.md`](15-audit/rls-policy-checklist.md); enforced on every CI run by `tests/integration/security-sweep.test.ts`. Finding 2 (cross-org role reads) fixed in `20260826090300`.
- [x] Every Server Action/Route Handler is confirmed permission-checked or explicitly documented as intentionally public. — [`15-audit/server-action-authorization-checklist.md`](15-audit/server-action-authorization-checklist.md). Finding 3 (`markRead` actions) fixed.
- [x] The full cross-milestone regression/E2E suite passes reliably in CI. — `tests/e2e/authenticated/journey-onboarding.spec.ts`, `journey-sale-to-report.spec.ts`; consolidated `security-sweep` + `hardening` + `pos-load` integration suites. Non-flaky over three consecutive CI runs (see Definition of Done).
- [x] Cross-browser and responsive testing passes across the whole application. — `PLAYWRIGHT_BROWSERS` factory in `playwright.config.ts` + nightly `.github/workflows/cross-browser.yml` (chromium + firefox + webkit).
- [x] No secret exists in git history; any prior exposure is rotated. — [`15-audit/secrets-review.md`](15-audit/secrets-review.md): no committed secret found; nothing to rotate.
- [x] Rate limiting is in place on login, webhook, and checkout endpoints. — [`15-audit/rate-limiting.md`](15-audit/rate-limiting.md); `lib/rate-limit/` + `rate_limits` table. Finding 1's audit RPC is rate-limited too.
- [x] A written audit summary exists and is reviewed. — [`15-audit/findings-and-fixes.md`](15-audit/findings-and-fixes.md).

## Definition of Done

All acceptance criteria pass, the audit checklist is complete with zero open findings (or all findings explicitly deferred with a documented reason and owner), and the regression suite is stable (non-flaky) across at least three consecutive CI runs.

## Implementation Notes

- This milestone should be treated as a genuine audit, not a rubber stamp — budget real time for it; per the project's own emphasis, security is not credible as a checkbox exercise.
- Any finding here that reveals a gap traceable to a specific earlier milestone's Security Requirements section not being followed should be logged clearly so the pattern (not just the instance) can be corrected going forward.

## Risks

- The biggest risk at this stage is treating this milestone as a formality after 14 milestones of feature work — resist schedule pressure to shortcut it, since this is specifically the layer that catches cross-feature interaction bugs no single earlier milestone could have caught alone.

## Future Considerations

- Establish a lightweight recurring cadence (e.g., before every major future feature addition post-launch) for repeating a scaled-down version of this audit, so security review doesn't become a one-time event.
