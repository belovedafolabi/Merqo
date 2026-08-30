# Milestone 15 — Security & QA Audit Record

This directory is the committed record the milestone's Technical Requirements
call for: "a written, checked-off checklist (one row per table/action)...
reviewable, not just verbally confirmed."

| File | What it is |
|------|-----------|
| [`findings-and-fixes.md`](findings-and-fixes.md) | The owner-facing summary: every issue the audit found, its severity, the evidence, the fix, and its status. Start here. |
| [`rls-policy-checklist.md`](rls-policy-checklist.md) | One row per table: RLS enabled, policies present, scoping mechanism, verdict. |
| [`server-action-authorization-checklist.md`](server-action-authorization-checklist.md) | One row per Server Action module and Route Handler: which guard, called where, or the documented reason it is public. |
| [`secrets-review.md`](secrets-review.md) | Git-history scan result, secret inventory, rotation status. |
| [`dependency-triage.md`](dependency-triage.md) | Dependabot / `pnpm audit` state and any accepted-with-reason advisories. |
| [`rate-limiting.md`](rate-limiting.md) | The rate-limit buckets, keys, thresholds, the fail-open decision, and how to tune them. |

## How the audit was run

Three parallel sweeps against the assembled system (Milestones 01–14):

1. **Server-side authorization** — every `'use server'` module and every
   `app/**/route.ts`, checked for a `requirePermission` / `requireUser` call
   or a documented public reason.
2. **RLS** — every `CREATE TABLE` across `supabase/migrations/`, checked for
   `ENABLE ROW LEVEL SECURITY` and at least one policy, and for
   organization/branch scoping.
3. **Test & CI infrastructure** — coverage gaps that let a cross-milestone
   regression through.

The system was in good shape going in (49/49 tables RLS-enabled, 62 guarded
mutations, no committed secret, gitleaks + Dependabot already wired). The
audit found **seven** real defects — one HIGH, one MEDIUM, five LOW — plus the
predicted gaps (no rate limiting beyond login, Chromium-only E2E, no
cross-milestone journey suite, no high-concurrency POS test). All are fixed
in this milestone's branch; see `findings-and-fixes.md`.

## Kept honest by tests, not by this document

`docs/` records what was true on the day the audit ran. What keeps it true is
`tests/integration/security-sweep.test.ts`: it re-derives the RLS matrix and
the anon-executable function set from the live catalog on every CI run, with
a self-documenting allow-list. A regression fails the build rather than
waiting for the next manual audit.
