# Merqo

Merqo is a configurable, multi-business-type Point-of-Sale platform, deployed independently
per client. One POS engine adapts to supermarkets, restaurants, pharmacies, fashion stores,
and more via configuration rather than per-industry rewrites.

See [`docs/milestones/README.md`](docs/milestones/README.md) for the full implementation
roadmap and [`docs/milestones/DECISIONS_AND_CONFLICTS.md`](docs/milestones/DECISIONS_AND_CONFLICTS.md)
for the authoritative resolution of architectural decisions.

## Stack

| Layer                | Choice                                                     |
| -------------------- | ---------------------------------------------------------- |
| Framework            | Next.js 16 (App Router) + React 19 + TypeScript 6          |
| Styling              | Tailwind CSS v4 (CSS-first) + shadcn/ui                    |
| Backend/data         | Supabase (Postgres + Auth + Storage)                       |
| Email                | Resend                                                     |
| Subscription billing | Paystack — software subscriptions only, never POS payments |
| Package manager      | pnpm                                                       |
| Testing              | Vitest + React Testing Library (unit), Playwright (E2E)    |
| CI/CD                | GitHub Actions                                             |
| Hosting              | Vercel                                                     |

**There is no Express or standalone Node backend.** Server-side logic lives entirely in
Next.js Server Actions and Route Handlers, talking to Supabase directly. Earlier design
documents (`docs/PRD.md`, `docs/TAS.md`) describe an Express-based "ERN" stack — that was
superseded during the design process; see `docs/milestones/DECISIONS_AND_CONFLICTS.md` §1
before reintroducing it.

## Prerequisites

- Node.js 24 (see `.nvmrc`)
- pnpm 11, via `corepack enable`
- Docker Desktop — only needed for local Supabase (`pnpm db:start`)
- Supabase CLI — installed automatically as a project dependency; a global install is optional

## Local setup

```bash
corepack enable
pnpm install
cp .env.example .env.local     # fill in Supabase values, see below
pnpm dev                       # http://localhost:3000
```

Verify it's running:

```bash
curl http://localhost:3000/api/health
# {"status":"ok","service":"merqo","timestamp":"...","commit":null,"checks":{"supabase":"not_configured"}}
```

`checks.supabase` reads `"not_configured"` until `.env.local` has real Supabase values — that's
expected, not an error.

## Environment variables

Every variable is documented in [`.env.example`](.env.example) with inline comments. Three
rules apply everywhere in this project:

1. Never commit a real value — `.env.example` holds placeholders only.
2. Anything prefixed `NEXT_PUBLIC_` is shipped to the browser. Never put a secret behind that
   prefix.
3. `SUPABASE_SERVICE_ROLE_KEY` is server-only and bypasses Row Level Security. It must never
   be imported from a Client Component, and lives only in Vercel's and GitHub's encrypted
   secret stores — never in a file that gets committed.

| Variable                        | Required from | Scope           | Source                                           |
| ------------------------------- | ------------- | --------------- | ------------------------------------------------ |
| `NEXT_PUBLIC_APP_URL`           | Milestone 01  | Public          | Set manually                                     |
| `NEXT_PUBLIC_SUPABASE_URL`      | Milestone 01  | Public          | Supabase Dashboard → Project Settings → API      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Milestone 01  | Public          | Supabase Dashboard → Project Settings → API      |
| `SUPABASE_SERVICE_ROLE_KEY`     | Milestone 03  | **Server-only** | Supabase Dashboard → Project Settings → API      |
| `SUPABASE_PROJECT_REF`          | Milestone 01  | Server-only     | Supabase Dashboard, or `supabase status` locally |
| `SUPABASE_DB_PASSWORD`          | Milestone 02  | Server-only     | Set when the project was created                 |
| `RESEND_API_KEY`                | Milestone 12  | Server-only     | Resend dashboard                                 |
| `PAYSTACK_SECRET_KEY`           | Milestone 13  | Server-only     | Paystack dashboard (subscription billing only)   |

## Local Supabase

```bash
pnpm db:start     # requires Docker Desktop running
pnpm db:status     # prints local URL + keys — paste into .env.local
pnpm db:stop
```

There is no schema yet — that's Milestone 02. `pnpm db:start` gives you a working local
Postgres/Auth/Storage stack to develop against as soon as migrations exist.

## Branching strategy

- `main` is production-ready. Direct pushes are disabled by branch protection (see below).
- Work happens on `feature/*`, `fix/*`, or `chore/*` branches, merged via pull request.
- PRs are **squash-merged**; branches auto-delete on merge.
- The repository is **public** (a deliberate choice — see `docs/milestones/DECISIONS_AND_CONFLICTS.md`
  and the Milestone 01 PR for context: GitHub's branch-protection APIs return a 403 on private
  repos without a paid plan, so the repo was made public to unlock real enforcement and native
  secret scanning at $0 cost).
- Branch protection requires all three CI checks to pass and requires a pull request before
  merge. `required_approving_review_count` is set to **0** — GitHub does not allow self-approval,
  which would otherwise permanently block a solo contributor. This is a deliberate, documented
  exception, not an oversight.

## Running tests

```bash
pnpm test          # Vitest, once
pnpm test:watch    # Vitest, watch mode
pnpm test:e2e      # Playwright — builds and starts the app itself
pnpm test:e2e:ui   # Playwright, interactive UI mode
```

First-time Playwright setup: `pnpm exec playwright install chromium`.

## The CI gate

Every pull request against `main` runs three jobs, all required to pass before merge:

1. **Secret scan** — Gitleaks, scans full history.
2. **Lint, typecheck, unit tests, build** — `pnpm format:check && lint && typecheck && test && build`.
3. **E2E (Playwright)** — full build + start + browser test run.

Later milestones **extend** `.github/workflows/ci.yml` with their own test suites rather than
creating a parallel pipeline.

## Logging convention

```ts
import { logger } from '@/lib/logger'

logger.info('sale.created', { saleId, branchId })
```

- One structured JSON line per call, routed to the matching `console.*` method by severity.
- `message` is a dotted event name, not a sentence — grep-able and stable across refactors.
- Context keys matching `/key|token|secret|password|authorization|cookie|apikey/i` are
  automatically redacted before logging.
- No external log aggregator — Vercel's free log retention plus this structured shape is the
  whole observability story for now, per the project's cost constraint. Revisit at Milestone 16
  if that stops being enough.

## Deployment

Hosted on Vercel: production deploys from `main`, preview deploys per pull request. Environment
variables are set in Vercel's dashboard for both Production and Preview — never in git.

## Known constraints — revisit before Milestone 16 (production launch)

- **Supabase free tier**: connection pool and storage limits apply. Not a concern at current
  scale; worth re-checking before onboarding a real client.
- **Vercel Hobby tier prohibits commercial use.** Merqo is a commercial subscription product,
  so Vercel Pro ($20/month) will eventually be required — which alone exceeds this project's
  stated $10/month infrastructure ceiling. This needs an explicit decision before a real
  commercial launch; it does not block development.
- **GitHub Free plan** has no branch protection or native secret scanning on _private_ repos.
  Resolved here by making the repository public (see Branching strategy above); Gitleaks in CI
  covers secret scanning either way.
- **ESLint is pinned to 9.39.5, not the latest 10.x.** `eslint-config-next@16.3.2`'s bundled
  `eslint-plugin-react@7.37.5` crashes at runtime against ESLint 10's removed legacy Context
  API (`context.getFilename()`). Revisit once Next.js ships an `eslint-config-next` update
  compatible with ESLint 10.
