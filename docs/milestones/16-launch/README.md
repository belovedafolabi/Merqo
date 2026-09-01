# Milestone 16 — Production Readiness & Launch

The operational record for the last milestone before a real client goes live.
Same shape as `docs/milestones/15-audit/`: an index here, one focused document
per concern.

| File | What it is |
|------|-----------|
| [`performance-review.md`](performance-review.md) | Evidence-based query/index review: EXPLAIN plans, per-query verdicts, and every index **added and declined**, with the measured number behind each decision. |
| [`backup-and-restore.md`](backup-and-restore.md) | The backup and restore procedure, the recorded local proof run, the backup security review, and the honest RTO/RPO on the free tier. |
| [`client-provisioning.md`](client-provisioning.md) | The per-client deployment runbook: what is scripted vs. a manual dashboard step, the client register (secret fingerprints), and the migration rollout rule. |
| [`operations.md`](operations.md) | Where to look when something breaks: a symptom → destination table keyed to the structured-log event names, the uptime-monitor setup, and the logging spot-check result. |
| [`cost-model.md`](cost-model.md) | Itemized recurring cost for one client deployment, plus the usage threshold that forces each paid upgrade — measured, not guessed. |
| [`launch-checklist.md`](launch-checklist.md) | The checkable list every item of which must be true before the first real client goes live, including the acknowledged open risks. |

## How this milestone was verified

- **Performance**: three integration suites — `pos-write-performance.test.ts`
  (new), `pos-search-performance.test.ts`, `reports-performance.test.ts` — at
  25k products / 20k sales / 100k movements, each pairing a loose timing
  budget with a deterministic `EXPLAIN` guard. Run on every PR inside
  `pnpm test:integration`.
- **Backup/restore**: `scripts/backup.sh` → `scripts/restore.sh` exercised
  end-to-end against the local Supabase stack; a 500-sale fixture round-tripped
  with every row count intact. Recorded in `backup-and-restore.md`.
- **Provisioning**: `scripts/provision-client.sh` run end-to-end against a
  fresh database (151 migrations + seed + `verify-client-db.sql` + secret
  generation); the empty-schema guard confirmed to refuse a populated target.
  Recorded in `client-provisioning.md`.
- **What is handed to the operator** (not doable from this repo): creating the
  real Supabase project and Vercel project, setting env vars, and creating the
  UptimeRobot monitor. Each is a numbered step in the relevant doc and a line
  on the launch checklist.
