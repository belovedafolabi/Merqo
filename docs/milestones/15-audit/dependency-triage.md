# Dependency vulnerability triage

Milestone 15 CI/CD Requirement: "Dependabot alerts triaged and either fixed
or explicitly accepted-with-reason, documented."

## Current state: clean

`pnpm audit --prod --audit-level high` → **No known vulnerabilities found**
(exit 0). This is now a genuine CI gate (`.github/workflows/ci.yml`,
`deps-audit` job) — no `continue-on-error`, no `|| true`.

## What is already in place

- **Dependabot** (`.github/dependabot.yml`): weekly `npm` + `github-actions`,
  grouped prod/dev, `chore(deps)` / `chore(ci)` prefixes. Two version pins
  documented inline (`eslint >=10`, `typescript >=7` — both ground-up
  rewrites, not routine bumps).
- **gitleaks** (`.github/workflows/ci.yml`, `secret-scan`): full-history
  secret scan on every push and PR.
- **Two existing security overrides** in `pnpm-workspace.yaml`, each with a
  written justification:
  - `ansi-regex@5.0.0 → 5.0.1` — GHSA-93q8-gq69-wqmw (ReDoS), dev-only chain,
    pinned anyway.
  - `uuid@8.3.2 → ^11.1.1` — GHSA-2825-h4q3-27g9 (missing buffer bounds
    check with a `buf` argument), unreachable through this project (exceljs
    only calls `v4()` with no args), pinned anyway.

## The escape hatch for an unfixable advisory

When a **production** advisory has no fix available and the `deps-audit` gate
goes red, do **not** weaken the gate. Instead:

1. Add the advisory's GHSA (preferred) or CVE id to
   `pnpm-workspace.yaml` → `auditConfig.ignoreGhsas` / `ignoreCves`.
2. Add a row to the table below: the advisory, the affected package and
   chain, why the vulnerable code path is unreachable here (or why no fix
   exists), and a revisit-by date.
3. Both changes in the same commit, so a reviewer sees the reasoning next to
   the suppression.

An ignored advisory is a reviewed, time-boxed decision — not a disabled
check.

| GHSA / CVE | Package · chain | Why suppressed | Revisit by |
|------------|-----------------|----------------|------------|
| _(none)_ | | | |

## CodeQL

Not added. GitHub's CodeQL / code scanning is free for **public**
repositories but requires paid **GitHub Advanced Security** on a private one.
`belovedafolabi/Merqo` is private, and adding GHAS is a real line item against
the project's $0–$10/month constraint. Decision: rely on
`pnpm audit` + Dependabot + gitleaks + the `security-sweep` integration test
for now; revisit if the repo is ever made public or the budget changes.
Logged in `docs/milestones/DECISIONS_AND_CONFLICTS.md`.
