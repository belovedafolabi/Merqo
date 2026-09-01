# Launch Checklist

Every item must be true before a real client's production deployment goes
live. Instantiate a copy per client (or track per-client in the client
register in `client-provisioning.md`).

Client: ________________________   Target launch date: ________________

## 1. Repo & CI

- [ ] `main` is green — `quality`, `db-migrations`, `e2e`, `secret-scan`,
      `deps-audit`, `CodeQL` all passing on the commit being deployed.
- [ ] `pnpm audit --prod --audit-level high` clean, or every exception has a
      row in `docs/milestones/15-audit/dependency-triage.md`.
- [ ] Migration count in `supabase/migrations/` matches what the deploy will
      apply.

## 2. Database (per `client-provisioning.md`)

- [ ] Supabase project created (region near the client, strong DB password).
- [ ] `pnpm client:provision --project-ref <ref>` run; its full output
      archived (migration count, `verify-client-db.sql` pass, fingerprints).
- [ ] `verify-client-db.sql` passes against the live project.
- [ ] Owner account promoted to Super Admin — README.md "Runbook: promoting a
      Super Admin" (`select public.promote_to_super_admin('owner@…')`).

## 3. Secrets

- [ ] Every variable in `.env.example` set in the Vercel project for
      **Production and Preview**.
- [ ] Per-client vs. platform-shared split respected (`client-provisioning.md`
      table) — Supabase-issued values, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`
      unique; `RESEND_API_KEY`, `PAYSTACK_SECRET_KEY` the shared platform
      values.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` fingerprints recorded in
      the client register and **not already present there** (no reuse).
- [ ] `CRON_SECRET` set — otherwise `/api/cron/subscriptions` returns 503 and
      the daily sweep never runs.

## 4. Backup & recovery

- [ ] `pnpm db:backup --linked --client <name>` run once; the dump is stored
      encrypted, off the repo.
- [ ] A restore has been rehearsed at least once (locally is fine — see
      `backup-and-restore.md`); the operator has read that document.
- [ ] Decision recorded: does this client's data-loss tolerance require
      Supabase Pro / PITR, or is "last daily backup + manual backup before
      risky changes" acceptable? (See `cost-model.md`.)

## 5. Monitoring

- [ ] UptimeRobot HTTP(s) monitor created on `https://<domain>/api/health`,
      5-minute interval, keyword `"status":"ok"`, alert to the platform
      owner's email (`operations.md`).
- [ ] Alert verified: the monitor was paused once and the down-alert email
      confirmed received.

## 6. Verification

- [ ] `pnpm smoke https://<client-domain>` — all four checks pass.
- [ ] Paystack webhook `https://<domain>/api/webhooks/paystack` registered in
      the Paystack dashboard.
- [ ] One manual end-to-end sale completed on the real deployment (scan →
      cart → payment → receipt), and it appears in a report.
- [ ] `/api/health` returns `{"status":"ok","checks":{"supabase":"ok","postgrest":"ok"}}`.

## 7. Open risks — acknowledged, signed, dated

These are known and deliberately unresolved by Milestone 16. Sign that the
owner has seen them.

- [ ] **Vercel Hobby prohibits commercial use.** Merqo is a commercial
      subscription product. Vercel Pro is $20/month, which alone exceeds the
      project's $0–$10/month infrastructure target. **Milestone 16 did not
      amend that target.** Decision required at launch: accept Vercel Pro and
      revise the target, or move to another host. Cross-referenced:
      `README.md` "Known constraints", `cost-model.md`.
- [ ] **Supabase Free has no Point-in-Time Recovery.** RPO is the last daily
      automated backup (≤ ~24 h) plus whatever manual `scripts/backup.sh` was
      taken before the last risky change. Acceptable for this client? If not →
      Supabase Pro, +$25/month.
- [ ] **`roles.organization_id` shipped in this milestone** (`20260830090000`,
      resolving `DECISIONS_AND_CONFLICTS.md` §7a). On an established client
      database it backfills custom roles from their creator's organization; a
      custom role whose creator's identity was already deleted would fail the
      new CHECK constraint at deploy and need a manual `organization_id`.
      Confirmed not applicable to a brand-new deployment (no custom roles
      yet).

_Owner sign-off:_ ______________________   _Date:_ ______________
