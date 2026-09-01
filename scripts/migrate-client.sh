#!/usr/bin/env bash
#
# Milestone 16 — apply new migrations to an already-provisioned client.
#
# Deliberately separate from scripts/provision-client.sh: provisioning happens
# once and includes seeding and secret generation; migration happens many
# times and must NEVER re-seed or touch secrets. Conflating them risks running
# seed.sql — or worse, `db reset` — against a live client.
#
# Usage:
#   scripts/migrate-client.sh --project-ref <ref> --backup-taken
#   scripts/migrate-client.sh --db-url <postgres-url> --backup-taken
#
#   --backup-taken   Required. Asserts you ran scripts/backup.sh against this
#                    client first. This script will not proceed without it.
#
# Rollout rule (docs/milestones/16-launch/client-provisioning.md): migrations
# must stay backward-compatible for one release, because Vercel's deploy and
# Supabase's migration are not atomic and the fleet is updated one client at a
# time.

set -euo pipefail

MODE="" REF="" DB_URL="" BACKUP="no"
while [ $# -gt 0 ]; do
  case "$1" in
    --project-ref) MODE="ref"; REF="${2:?}"; shift 2 ;;
    --db-url)      MODE="url"; DB_URL="${2:?}"; shift 2 ;;
    --backup-taken) BACKUP="yes"; shift ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$MODE" ] || { echo "error: pass --project-ref <ref> or --db-url <url>" >&2; exit 2; }
if [ "$BACKUP" != "yes" ]; then
  echo "error: run scripts/backup.sh against this client first, then pass --backup-taken" >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
SUPABASE=(pnpm exec supabase)

if [ "$MODE" = "url" ]; then
  PSQL_URL="$DB_URL"; CONN=(--db-url "$DB_URL")
else
  : "${SUPABASE_DB_PASSWORD:?set SUPABASE_DB_PASSWORD before linking}"
  "${SUPABASE[@]}" link --project-ref "$REF" >/dev/null
  PSQL_URL="postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.${REF}.supabase.co:5432/postgres"
  CONN=(--linked)
fi

echo "==> Pending migrations for this client:"
"${SUPABASE[@]}" migration list "${CONN[@]}" || true
echo
read -r -p "Apply the migrations listed as local-only above? [y/N] " ans
case "$ans" in y|Y|yes) ;; *) echo "aborted."; exit 0 ;; esac

echo "==> Applying"
"${SUPABASE[@]}" db push "${CONN[@]}"

echo "==> Verifying"
if "${SUPABASE[@]}" db query --db-url "$PSQL_URL" -f "$REPO_ROOT/scripts/verify-client-db.sql"; then
  echo "==> Migration verified OK"
else
  echo "!!! Verification FAILED after migration — restore from the backup you took" >&2
  exit 1
fi
