#!/usr/bin/env bash
#
# Milestone 16 — provision one new client's database.
#
# Runs the error-prone, order-dependent half of standing up a new client
# deployment. The other half — creating the Supabase project and the Vercel
# project, setting env vars, attaching the domain — is six dashboard steps,
# documented in docs/milestones/16-launch/client-provisioning.md, not scripted:
# scripting it would mean storing two long-lived platform tokens to replace a
# handful of clicks done a few times a year.
#
# Steps: preflight -> migrations (supabase db push) -> seed (supabase/seed.sql,
# explicitly — `db push` does NOT run it, and `db reset` would be catastrophic
# against a client DB) -> verify -> generate this client's CRON_SECRET ->
# print the env-var checklist and secret fingerprints for the client register.
#
# Usage:
#   scripts/provision-client.sh --project-ref <ref>     # cloud: links first
#   scripts/provision-client.sh --db-url <postgres-url> # direct / local proof
#
# See docs/milestones/16-launch/client-provisioning.md.

set -euo pipefail

MODE="" REF="" DB_URL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --project-ref) MODE="ref"; REF="${2:?}"; shift 2 ;;
    --db-url)      MODE="url"; DB_URL="${2:?}"; shift 2 ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$MODE" ] || { echo "error: pass --project-ref <ref> or --db-url <url>" >&2; exit 2; }

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
SUPABASE=(pnpm exec supabase)

# --- 1. Preflight -----------------------------------------------------------
echo "==> Preflight"

PINNED="$(node -p "require('./package.json').devDependencies.supabase" 2>/dev/null || echo '?')"
RUNNING="$("${SUPABASE[@]}" --version 2>/dev/null | head -1 | tr -d '[:space:]')"
if [ "$PINNED" != "?" ] && [ "$RUNNING" != "$PINNED" ]; then
  echo "    ! supabase CLI is $RUNNING but package.json pins $PINNED — provision with the pinned version" >&2
  exit 1
fi
echo "    supabase CLI $RUNNING (matches pin)"

PG_IMAGE="${SUPABASE_PG_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.155}"
if command -v psql >/dev/null 2>&1; then
  psql_q()     { psql "$1" -tAqc "$2"; }
  psql_stdin() { psql "$1" -v ON_ERROR_STOP=1 -f -; }
else
  psql_q()     { docker run --rm -i --network host "$PG_IMAGE" psql "$1" -tAqc "$2"; }
  psql_stdin() { docker run --rm -i --network host "$PG_IMAGE" psql "$1" -v ON_ERROR_STOP=1 -f -; }
fi

# Resolve a direct psql URL for the seed + verify steps.
if [ "$MODE" = "url" ]; then
  PSQL_URL="$DB_URL"
  CONN=(--db-url "$DB_URL")
else
  : "${SUPABASE_DB_PASSWORD:?set SUPABASE_DB_PASSWORD for the target project before linking}"
  echo "    linking project $REF"
  "${SUPABASE[@]}" link --project-ref "$REF" >/dev/null
  PSQL_URL="postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.${REF}.supabase.co:5432/postgres"
  CONN=(--linked)
fi

# Target must be reachable and have an EMPTY public schema — provisioning over
# an existing deployment is always a mistake.
REACH="$(psql_q "$PSQL_URL" "select 1" || true)"
[ "$REACH" = "1" ] || { echo "    ! cannot reach the target database" >&2; exit 1; }
PUBTABLES="$(psql_q "$PSQL_URL" "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")"
if [ "${PUBTABLES:-0}" != "0" ]; then
  echo "    ! target public schema already has $PUBTABLES tables — not empty, refusing" >&2
  echo "      (to apply new migrations to an existing client, use scripts/migrate-client.sh)" >&2
  exit 1
fi
echo "    target reachable, public schema empty"

# --- 2. Migrations --------------------------------------------------------
echo "==> Applying migrations (supabase db push)"
"${SUPABASE[@]}" db push "${CONN[@]}"

# --- 3. Seed -----------------------------------------------------------------
# The trap this script exists to remove: `supabase db push` does NOT run
# supabase/seed.sql against a linked/remote project (only `db reset` does, and
# `db reset` would wipe a client). A hand-provisioned client would silently
# get no business types, roles, permissions or subscription pricing.
# seed.sql is `on conflict do nothing` throughout, so this is safe to re-run.
echo "==> Seeding (supabase/seed.sql)"
psql_stdin "$PSQL_URL" < supabase/seed.sql >/dev/null

# --- 4. Verify -------------------------------------------------------------
echo "==> Verifying"
if ! "${SUPABASE[@]}" db query --db-url "$PSQL_URL" -f "$REPO_ROOT/scripts/verify-client-db.sql"; then
  echo "    ! verification FAILED — do not put this deployment into service" >&2
  exit 1
fi
MIGRATION_ROWS="$(psql_q "$PSQL_URL" "select count(*) from supabase_migrations.schema_migrations")"
LOCAL_MIGRATIONS="$(ls -1 supabase/migrations/*.sql | wc -l | tr -d ' ')"
echo "    migrations applied: $MIGRATION_ROWS (repo has $LOCAL_MIGRATIONS)"
[ "$MIGRATION_ROWS" = "$LOCAL_MIGRATIONS" ] || echo "    ! migration ledger count differs from the repo — investigate before launch" >&2

# --- 5. Per-client secret --------------------------------------------------
CRON_SECRET="$(openssl rand -hex 32)"
fp() { printf '%s' "$1" | { sha256sum 2>/dev/null || shasum -a 256; } | cut -c1-12; }

cat <<EOF

============================================================================
 PROVISIONING COMPLETE
============================================================================

Set these in the client's Vercel project (Production + Preview):

  PER-CLIENT (unique to this deployment — never reused):
    NEXT_PUBLIC_SUPABASE_URL       <from Supabase dashboard -> API>
    NEXT_PUBLIC_SUPABASE_ANON_KEY  <from Supabase dashboard -> API>
    SUPABASE_SERVICE_ROLE_KEY      <from Supabase dashboard -> API>  (server-only)
    SUPABASE_PROJECT_REF           ${REF:-<project ref>}
    SUPABASE_DB_PASSWORD           <chosen at project creation>       (server-only)
    NEXT_PUBLIC_APP_URL            https://<this client's domain>
    CRON_SECRET                    ${CRON_SECRET}
                                   (^ generated now, shown once, not written to disk)

  PLATFORM-SHARED (identical across every client — do NOT regenerate):
    RESEND_API_KEY                 <platform Resend key>
    PAYSTACK_SECRET_KEY            <platform Paystack key — subscription billing only>

Record in docs/milestones/16-launch/client-provisioning.md's client register:

  service-role fingerprint : (compute after copying the key)  fp = sha256[:12]
  cron-secret  fingerprint : $(fp "$CRON_SECRET")

If either fingerprint already appears in the register, a secret was reused —
stop and regenerate.

Next: promote the owner (README.md "promoting a Super Admin"), register the
Paystack webhook, add the UptimeRobot monitor, then run:
  pnpm smoke https://<this client's domain>
============================================================================
EOF
