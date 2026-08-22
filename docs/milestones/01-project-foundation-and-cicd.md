# Milestone 01 — Project Foundation & CI/CD

## Status

Complete — merged via [PR #1](https://github.com/belovedafolabi/Merqo/pull/1) (2026-08-22)

## Objective

Stand up the repository as a working software project: a runnable Next.js + TypeScript application skeleton, package management, code-quality tooling, a GitHub-based branching/PR workflow with protected `main`, a GitHub Actions pipeline that installs/lints/typechecks/tests/builds on every PR, environment/secret-management conventions, an initial Supabase project connection, and empty-but-wired test frameworks — before any domain feature exists.

## Why This Milestone Exists

The repository currently has no application code, no config, no CI/CD, no tests, and no git history (`git log` reports zero commits). Every later milestone assumes these things already exist and will add to them incrementally. Per the project's non-negotiable requirement, CI/CD and testing must begin on Day One, not be bolted on later — this milestone is that Day One. Getting this scaffolding wrong (e.g., no branch protection, no CI gate) means every subsequent milestone inherits an unenforced quality bar.

## Dependencies

None — this is the first milestone.

## Scope

- Git repository hygiene: `.gitignore`, initial commit of `docs/`, branching strategy documentation, protected `main` branch, required PR reviews/checks.
- Next.js (App Router) + TypeScript application skeleton (no feature code — a health-check route/page only).
- Package management: pnpm workspace (single app is fine; workspace config still established for future extraction if ever needed), lockfile committed.
- Tooling: ESLint, Prettier, TypeScript strict mode, Tailwind CSS + shadcn/ui installed (configuration only — see Milestone 04 for actual design tokens/components).
- GitHub Actions workflow: install → lint → typecheck → unit test → build, running on every PR and on pushes to `main`.
- Environment variable convention: `.env.example` with placeholders only, documented required variables (Supabase URL/keys, Resend key, Paystack keys, app URL) — no real secrets committed.
- Supabase project connection: local Supabase CLI project linked, `supabase/` directory initialized (config only, no schema yet — schema starts in Milestone 02).
- Test framework installation: Vitest + React Testing Library (unit/component), Playwright (E2E) — installed, configured, running against a trivial smoke test each, not yet exercising real features.
- Deployment target decision recorded: Vercel (per `docs/milestones/DECISIONS_AND_CONFLICTS.md` §1), with a preview-deployment-per-PR configuration if within Vercel's free tier.
- Basic native logging/error-handling convention established (structured console logging wrapper; no paid log aggregator).

## Out of Scope

- Any database schema (Milestone 02).
- Any authentication (Milestone 03).
- Any UI design system/components beyond install (Milestone 04).
- Production monitoring/alerting depth (Milestone 16).
- Actual Supabase migrations (Milestone 02 onward).

## Functional Requirements

- A developer can clone the repo, run one install command, and run the app locally against a local/dev Supabase instance.
- A pull request against `main` cannot be merged unless install, lint, typecheck, unit tests, and build all pass in GitHub Actions.
- `main` is a protected branch: no direct pushes, at least one required status check, linear history preferred.
- `.env.example` fully documents every environment variable the app will need through at least Milestone 03, with placeholder values only.
- The health-check route returns a 200 response confirming the app is running and (optionally) that it can reach Supabase.

## Technical Requirements

- **Framework:** Next.js App Router, TypeScript strict mode, pnpm as the sole package manager (per Stage 32's explicit decision — no npm/yarn lockfiles).
- **Styling baseline:** Tailwind CSS installed; shadcn/ui CLI initialized (component installation begins in Milestone 04).
- **Linting/formatting:** ESLint (Next.js + TypeScript rule sets) and Prettier, both enforced in CI, both runnable locally via `pnpm lint` / `pnpm format`.
- **Supabase tooling:** Supabase CLI added as a dev dependency; `supabase/config.toml` created; local Supabase emulation available for development (`supabase start`), documented in a `CONTRIBUTING.md` or `README.md`.
- **Hosting:** Vercel project connected to the GitHub repo; production and preview environments configured; environment variables set in Vercel's dashboard (never committed).

## Database Changes

None. Supabase project/CLI is connected and initialized in this milestone, but no schema, tables, or migrations are created — that begins in Milestone 02.

## API / Backend Changes

- One trivial Next.js Route Handler (e.g., `/api/health`) returning application status, used to verify the deployed environment is reachable and (optionally) that Supabase connectivity works. No business logic.

## Frontend Changes

- Minimal root layout and a single placeholder page confirming the app renders (no design system applied yet — that's Milestone 04).
- No feature screens.

## Security Requirements

- No secrets committed to git at any point — enforced by `.gitignore` covering `.env*` (except `.env.example`) and a CI/CD secret-scanning step (e.g., Gitleaks or GitHub's built-in secret scanning) added to the Actions workflow.
- Supabase service-role key never referenced from any client-side code path, and never stored anywhere but Vercel's/GitHub's encrypted secret stores — this rule is established here and enforced by every later milestone.
- Dependabot (or equivalent, free) enabled for dependency vulnerability alerts.

## Testing Requirements

- One passing Vitest unit test (smoke test) to prove the unit test runner works.
- One passing Playwright E2E test that loads the app's root page and asserts it renders, to prove the E2E runner works end-to-end including a real browser.
- CI must fail the build if lint, typecheck, unit tests, or build fail — verified by intentionally breaking each once during setup and confirming the pipeline red/greens correctly, then reverting.

## CI/CD Requirements

- GitHub Actions workflow file(s) covering: dependency install (`pnpm install --frozen-lockfile`), lint, typecheck (`tsc --noEmit`), unit tests, build.
- Workflow triggers: on pull request to `main`, and on push to `main`.
- Branch protection rule on `main`: required status checks (the workflow above), require PR before merge, require at least one approval (or self-approval allowed if solo, documented as a deliberate choice) dismiss stale approvals on new commits.
- Vercel deployment wired for preview builds per PR and production deploy on merge to `main`.
- This pipeline is the foundation every later milestone extends — each new milestone's Testing Requirements are appended to the same workflow, not created as a parallel pipeline.

## Observability

- Structured console logging convention established (e.g., a thin `logger` wrapper distinguishing info/warn/error, consistent JSON-ish shape) — no external log aggregation service (cost constraint).
- Errors surfaced to the console with enough context (route, input shape without secrets) to debug from Vercel's free log retention.
- No paid APM/monitoring service introduced at this stage (see Milestone 16 for what, if anything, gets added before production launch, still within the $10/month ceiling).

## Deliverables

- Working Next.js + TypeScript app skeleton, committed to `main` via the enforced PR workflow.
- `docs/milestones/DECISIONS_AND_CONFLICTS.md` and this roadmap committed alongside the code (documentation and code now live in the same repo history).
- `.github/workflows/ci.yml` (or equivalent) implementing the pipeline above.
- `.env.example` fully documented.
- `supabase/` directory initialized and linked to a real Supabase project (free tier).
- Vercel project live with a working preview URL.
- `README.md` covering local setup, environment variables, branching strategy, and how to run tests.

## Acceptance Criteria

- [ ] `pnpm install && pnpm dev` runs the app locally with no manual undocumented steps.
- [ ] A PR opened against `main` triggers the GitHub Actions pipeline automatically.
- [ ] The pipeline fails when lint, typecheck, a unit test, or the build is intentionally broken (verified once, then reverted).
- [ ] `main` cannot be pushed to directly (branch protection enforced).
- [ ] The health-check route responds successfully in both local and deployed (Vercel) environments.
- [ ] No secret values exist anywhere in git history.
- [ ] A Playwright E2E test and a Vitest unit test both pass in CI.
- [ ] Vercel preview deployments are generated automatically per PR.

## Definition of Done

All acceptance criteria are checked, the pipeline is green on `main`, the app is reachable at a live Vercel URL, and a new contributor following only `README.md` can get the app running locally and understand how to open a compliant PR.

## Implementation Notes

- Keep the pnpm workspace single-package unless/until a real reason to split emerges (e.g., a future shared package) — do not pre-build a monorepo structure speculatively; this matches the project's own "avoid over-engineering" cost principle.
- Prefer GitHub's built-in secret scanning over a third-party paid tool.
- Vercel's free tier and GitHub Actions' free minutes for public/private repos under normal usage should keep this milestone at $0.
- Do not enable Vercel Analytics/Speed Insights paid tiers; the free tier (if used at all) is sufficient for now.

## Risks

- Under-scoping CI now (e.g., skipping typecheck) is cheap to fix today and expensive to retrofit once 30+ PRs have merged without it — the pipeline defined here must include all four gates from day one.
- Vercel/Supabase free-tier limits could be hit later (e.g., serverless function duration, DB connection limits) — not a concern at this milestone's scale, but worth a one-line note in `README.md` so Milestone 16 knows to revisit.

## Future Considerations

- If the project ever needs a genuinely separate service (e.g., a background worker), the pnpm workspace structure established here should make that extraction straightforward without a rewrite — but do not build that structure speculatively now.
