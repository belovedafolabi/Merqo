# Backup & Restore

Merqo is deployed as one independent Supabase project per client. This
document covers the **supplementary logical backup** you take by hand before a
risky operation, and the restore procedure — both scripted, both proved
locally.

Supabase's own automated backups are the primary recovery mechanism (see
"What the free tier gives you" below). `scripts/backup.sh` is what you run
*in addition*, immediately before running `scripts/migrate-client.sh` or any
manual SQL against a client database.

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/backup.sh` | Three-file logical dump (`roles.sql`, `schema.sql`, `data.sql`) via `supabase db dump`, with a SHA-256 manifest. |
| `scripts/restore.sh` | Data-only restore into a freshly-migrated target, followed by `verify-client-db.sql`. Guarded. |
| `scripts/verify-client-db.sql` | Pure-SQL invariant check. Also run by `provision-client.sh` and `migrate-client.sh`, and pasteable into the dashboard SQL editor. |

`psql` is used from `PATH` if present; otherwise both scripts run it from the
Supabase Postgres Docker image over the host network, feeding SQL on stdin —
so no local Postgres install is needed, only Docker (which the Supabase CLI
requires anyway).

## Taking a backup

```bash
# Cloud (the project currently linked in this repo):
pnpm db:backup --linked --client acme-stores

# A direct connection string (or local):
pnpm db:backup --db-url "postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres" --client acme-stores
```

Output: `backups/<client>/<UTC-timestamp>/{roles,schema,data}.sql` +
`manifest.txt`. `/backups/` is git-ignored.

`data.sql` excludes `storage.buckets` (Supabase-managed infrastructure config,
recreated before a restore) and, by default in a `--data-only` dump, the
`auth` schema is not included — GoTrue owns that.

## What the restore actually restores

**Data only.** In this architecture the schema's source of truth is
`supabase/migrations/`, not a dump. A recovered client is a brand-new Supabase
project with `supabase db push` run against it (`restore.sh --rebuild-schema`
does that), and `data.sql` loaded on top of the empty tables.
`schema.sql` in the backup is a point-in-time reference for diffing, not the
restore path.

```bash
pnpm db:restore \
  --from backups/acme-stores/20260901T110847Z \
  --into "postgresql://postgres:...@db.<newref>.supabase.co:5432/postgres" \
  --i-understand-this-overwrites postgres \
  --rebuild-schema
```

The `--i-understand-this-overwrites <db-name>` argument must match the
database name in `--into`. It is the one guard against restoring the wrong
dump into a live project. Restore then runs `verify-client-db.sql` and exits
non-zero if it fails — a silently half-restored database cannot report
success.

## Recorded local proof

Run against the local Supabase stack on 2026-09-01. The local stack is a
genuine non-production environment; the caveat is that only the `--db-url`
code path is exercised — `--linked` differs solely in how the connection is
resolved.

**1. Seed a realistic fixture** into the local `postgres` database: one org
(`dr-proof-org`), 200 products, 500 sales spread over ~10 months.

**2. Backup:**

```
roles.sql             370 bytes  sha256=168a95a9c745af5ed4679751f90419ac9dc434240a213b03e32a06d5664c2308
schema.sql         324070 bytes  sha256=3a57f8f6ab35e9bebc4177812d560d7385ca60857013803b2b0d37c60dc2b55d
data.sql           275353 bytes  sha256=2a00fbc72bca0117e03a7820bd8bd27cbc1fb30834c6bb0ae573467b3092ed5e
```

**3. Restore round-trip** — the public transactional tables were truncated
(simulating a freshly-migrated empty target) and `data.sql` was replayed with
`session_replication_role = replica` (which `data.sql` sets itself). Row
counts before vs. after:

| Table | before | after |
|-------|--------|-------|
| sales | 500 | 500 |
| products | 200 | 200 |
| organizations | 1 | 1 |
| business_types | 13 | 13 |
| roles (system) | 8 | 8 |
| permissions | 59 | 59 |

Every row round-tripped. `verify-client-db.sql` passed against the restored
state.

**4. Cleanup:** proof databases dropped, local stack `db reset` to a clean
state.

## Backup security review

`data.sql` contains customer PII, `auth.users` password hashes (when the
`auth` schema is included in a full dump), and Paystack payment references.

- `/backups/` is in `.gitignore`. `backup.sh` writes only there and prints a
  "contains PII — keep it encrypted, do not commit or share" banner.
- gitleaks in CI is the backstop against a dump containing a key being
  committed.
- **Explicitly rejected:** a scheduled GitHub Action that dumps a client
  database to a workflow artifact. That would place full customer PII into
  GitHub's artifact storage — a new and worse security surface, and exactly
  what Milestone 16's Security Requirements warn against. Supabase's own daily
  backups plus this on-demand procedure before risky operations is the whole
  plan.

## What the free tier gives you (RTO / RPO, stated honestly)

| | Supabase Free | Supabase Pro ($25/mo) |
|--|---------------|------------------------|
| Automated backups | Daily, retained 7 days, restore via dashboard | Daily + **Point-in-Time Recovery** (any second, 7-day window) |
| RPO | Up to ~24 h (last daily backup) — plus whatever `scripts/backup.sh` you took manually before a risky change | Seconds (PITR) |
| RTO | Dashboard restore of the daily backup, or `restore.sh --rebuild-schema` into a new project from a manual dump | Same, faster with PITR |

On the free tier, **the manual `scripts/backup.sh` before every
`migrate-client.sh` run is the RPO you actually control.** If a client's data
loss tolerance is lower than "last night's backup", that client needs
Supabase Pro — see `cost-model.md`.
