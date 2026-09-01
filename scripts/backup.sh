#!/usr/bin/env bash
#
# Milestone 16 — on-demand logical backup of one client database.
#
# A thin wrapper over the vendor-documented three-file dump so there is
# nothing bespoke to maintain. Take one before every scripts/migrate-client.sh
# run and before any manual SQL against a client database — see
# docs/milestones/16-launch/backup-and-restore.md.
#
# Usage:
#   scripts/backup.sh --db-url  <postgres-connection-string>  [--out DIR] [--client NAME]
#   scripts/backup.sh --linked                                [--out DIR] [--client NAME]
#
#   --db-url   Dump the database at this connection string (local proof, or a
#              direct cloud connection string).
#   --linked   Dump the Supabase project currently linked in this repo
#              (`supabase link`). The cloud path.
#   --out      Parent directory for the timestamped backup folder.
#              Default: ./backups
#   --client   Label for the backup folder. Default: "local" for --db-url,
#              the linked project ref for --linked.
#
# Output: <out>/<client>/<UTC-timestamp>/{roles,schema,data}.sql + manifest.txt
#
# SECURITY: data.sql contains customer PII, auth.users password hashes and
# Paystack references. It is written only under <out>, which is git-ignored.
# Encrypt it at rest and never attach it to a ticket or a chat.

set -euo pipefail

MODE=""
DB_URL=""
OUT_DIR="backups"
CLIENT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --db-url)  MODE="db-url"; DB_URL="${2:?--db-url needs a value}"; shift 2 ;;
    --linked)  MODE="linked"; shift ;;
    --out)     OUT_DIR="${2:?--out needs a value}"; shift 2 ;;
    --client)  CLIENT="${2:?--client needs a value}"; shift 2 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$MODE" ]; then
  echo "error: pass exactly one of --db-url <url> or --linked" >&2
  exit 2
fi

SUPABASE=(pnpm exec supabase)

# Resolve the connection selector both `supabase db dump` and this script pass on.
if [ "$MODE" = "db-url" ]; then
  CONN=(--db-url "$DB_URL")
  [ -n "$CLIENT" ] || CLIENT="local"
else
  CONN=(--linked)
  if [ -z "$CLIENT" ]; then
    CLIENT="$("${SUPABASE[@]}" status -o json 2>/dev/null \
      | grep -o '"project_ref":"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
    [ -n "$CLIENT" ] || CLIENT="linked"
  fi
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${OUT_DIR%/}/${CLIENT}/${STAMP}"
mkdir -p "$DEST"

echo "==> Backing up ($MODE) -> $DEST"

"${SUPABASE[@]}" db dump "${CONN[@]}" --role-only -f "$DEST/roles.sql"
"${SUPABASE[@]}" db dump "${CONN[@]}"             -f "$DEST/schema.sql"
# storage.buckets is Supabase-managed infrastructure config, not client data —
# it is recreated by the storage service / migrations before a restore, and
# leaving it in the data dump makes the load fail on a duplicate-key when the
# target already has its default buckets.
"${SUPABASE[@]}" db dump "${CONN[@]}" --data-only -x storage.buckets -f "$DEST/data.sql"

# Manifest: sizes + SHA-256 so a later restore can prove it read back the same
# bytes. `sha256sum` on Git-Bash / coreutils; `shasum -a 256` is the fallback.
hash_cmd() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  elif command -v shasum   >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1
  else echo "unavailable"; fi
}

{
  echo "client:    $CLIENT"
  echo "mode:      $MODE"
  echo "taken_at:  $STAMP"
  echo "cli:       $("${SUPABASE[@]}" --version 2>/dev/null | head -1)"
  echo
  for f in roles.sql schema.sql data.sql; do
    bytes=$(wc -c < "$DEST/$f" | tr -d ' ')
    printf '%-12s %12s bytes  sha256=%s\n' "$f" "$bytes" "$(hash_cmd "$DEST/$f")"
  done
} | tee "$DEST/manifest.txt"

echo
echo "==> Done. Contains PII — keep it encrypted, do not commit or share."
echo "    Restore with: scripts/restore.sh --from $DEST --into <target-url> ..."
