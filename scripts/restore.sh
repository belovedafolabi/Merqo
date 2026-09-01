#!/usr/bin/env bash
#
# Milestone 16 — restore a scripts/backup.sh dump into a target database, then
# verify the result. The dangerous script in the set, so it has guard rails:
# it refuses to run unless you name the target database back to it, and it
# fails loudly (non-zero) if the post-restore verification does not pass.
#
# WHAT THIS RESTORES: data only. In the independent-Supabase-project-per-
# client model, the schema's source of truth is supabase/migrations/, not a
# dump — a recovered client is a brand-new Supabase project with
# `supabase db push` run against it (pass --rebuild-schema to do that here),
# and the dump's data.sql loaded on top. schema.sql in the backup is a
# point-in-time reference, not the restore path.
#
# Usage:
#   scripts/restore.sh --from <backup-dir> --into <target-postgres-url> \
#       --i-understand-this-overwrites <target-db-name> [--rebuild-schema]
#
#   --from             A directory produced by scripts/backup.sh.
#   --into             Postgres URL of the target. Its database name must
#                      match --i-understand-this-overwrites. The target must
#                      already be a Supabase project (has auth/storage/…).
#   --i-understand-this-overwrites <name>
#                      The database name from --into, typed again.
#   --rebuild-schema   Run `supabase db push --db-url <into>` first, to build
#                      the public schema from migrations before loading data.
#
# psql: uses `psql` from PATH, else runs it from the Supabase Postgres Docker
# image over the host network (SQL fed on stdin, so no volume mount — works
# from a Windows/Git-Bash shell). Only Docker is required.
#
# See docs/milestones/16-launch/backup-and-restore.md for the recorded proof.

set -euo pipefail

FROM="" INTO="" CONFIRM="" REBUILD="no"

while [ $# -gt 0 ]; do
  case "$1" in
    --from) FROM="${2:?}"; shift 2 ;;
    --into) INTO="${2:?}"; shift 2 ;;
    --i-understand-this-overwrites) CONFIRM="${2:?}"; shift 2 ;;
    --rebuild-schema) REBUILD="yes"; shift ;;
    -h|--help) sed -n '2,32p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -n "$FROM" ] && [ -n "$INTO" ] && [ -n "$CONFIRM" ] || {
  echo "error: --from, --into and --i-understand-this-overwrites are all required" >&2
  exit 2
}
[ -f "$FROM/data.sql" ] || { echo "error: $FROM/data.sql not found" >&2; exit 2; }

TARGET_DB="${INTO##*/}"; TARGET_DB="${TARGET_DB%%\?*}"
if [ "$TARGET_DB" != "$CONFIRM" ]; then
  echo "error: --into database is '$TARGET_DB' but you confirmed '$CONFIRM'" >&2
  echo "       Re-run with: --i-understand-this-overwrites $TARGET_DB" >&2
  exit 2
fi

PG_IMAGE="${SUPABASE_PG_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.155}"
if command -v psql >/dev/null 2>&1; then
  psql_stdin() { psql "$1" -v ON_ERROR_STOP=1 -f -; }
else
  echo "==> psql not on PATH — using $PG_IMAGE via docker"
  psql_stdin() { docker run --rm -i --network host "$PG_IMAGE" psql "$1" -v ON_ERROR_STOP=1 -f -; }
fi

SUPABASE=(pnpm exec supabase)

if [ "$REBUILD" = "yes" ]; then
  echo "==> Rebuilding public schema from migrations"
  "${SUPABASE[@]}" db push --db-url "$INTO"
fi

echo "==> Restoring data from $FROM -> $TARGET_DB"
# data.sql opens with `SET session_replication_role = replica;` (the Supabase
# data-only dump emits it), deferring the FK/trigger checks the circular
# users<->identities constraint needs. --clean is NOT used: a data-only load
# onto a freshly-migrated schema starts from empty tables.
psql_stdin "$INTO" < "$FROM/data.sql"

echo "==> Verifying restored database"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if "${SUPABASE[@]}" db query --db-url "$INTO" -f "$SCRIPT_DIR/verify-client-db.sql"; then
  echo "==> Restore verified OK"
else
  echo "!!! Restore completed but verification FAILED — do not put this database into service" >&2
  exit 1
fi
