# Secrets review

Milestone 15 Acceptance Criterion: "No secret exists in git history; any
prior exposure is rotated."

## Result: no committed secret, nothing to rotate

### Git-history scan

- **CI already scans every push and PR** with `gitleaks/gitleaks-action@v3`
  (`.github/workflows/ci.yml`, `secret-scan` job, full history via
  `fetch-depth: 0`). It has been green since Milestone 01.
- **Manual full-history sweep** for this audit: every file ever added
  (`git log --all --diff-filter=A --name-only`) reviewed for secret-shaped
  names — only `.env.example` matches, and it contains placeholders only
  (`your-anon-key`, `your-service-role-key`, `generate-a-random-value-...`).
- **Pattern sweep** across all reachable commits for `sk_live_`,
  `sk_test_<20+ chars>`, `-----BEGIN`, and `AKIA[0-9A-Z]{16}` — **zero
  matches** outside the `.gitleaks.toml` allowlist.

### The one allowlisted match, and why it is not a secret

`.gitleaks.toml` allowlists two exact strings: the public "demo" anon and
service-role JWTs that the Supabase CLI prints for **every** local project on
**every** machine (identical in every Supabase quickstart). They appear only
as zero-setup fallbacks in `tests/integration/helpers/supabase.ts` and
`tests/e2e/helpers/seed.ts`, so `pnpm test:integration` / `pnpm test:e2e`
work against a fresh `supabase start` with no config. CI always overrides
them with the real local values from `supabase status`. The allowlist matches
by exact string, not file path — a real secret added to those same files
later is still caught.

## Secret inventory

Every secret the app consumes, where it lives, and whether it was ever
exposed.

| Secret | Where it belongs | Prefix rule | Ever committed? | Rotation |
|--------|-----------------|-------------|-----------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + GitHub env | public by design (`NEXT_PUBLIC_`) | placeholder only | n/a — not secret |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + GitHub env | public by design; RLS-bounded | placeholder only | n/a — anon key is meant to ship to browsers |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel + GitHub encrypted secrets, server-only | never `NEXT_PUBLIC_`; import-guarded to `lib/subscription/**` (`tests/unit/paystack/layering.test.ts`) | placeholder only | not required — never exposed |
| `SUPABASE_DB_PASSWORD` | local `.env.local` / Supabase dashboard | — | never (commented out in `.env.example`) | not required |
| `RESEND_API_KEY` | Vercel encrypted secrets | optional; unset → log transport | never | not required |
| `PAYSTACK_SECRET_KEY` | Vercel encrypted secrets | optional; unset → "not configured" | never | not required |
| `PAYSTACK_WEBHOOK_SECRET` | Vercel encrypted secrets | optional; falls back to `PAYSTACK_SECRET_KEY` | never | not required |
| `CRON_SECRET` | Vercel env (injected as `Authorization: Bearer` by Vercel Cron) | server-only; endpoint 503s if unset | never | not required |

## Encryption posture (confirmed, not changed)

- **In transit:** HTTPS everywhere, enforced by Vercel by default. No
  application code weakens it.
- **At rest:** relies on Supabase's platform-level guarantee, per
  `docs/Security _Architecture_And_Authorization.md` §68 ("Encryption at
  rest: Platform-supported"). Nothing in this codebase is expected to
  implement its own at-rest encryption.

## Super Admin — authenticated and audited

Per the milestone's Security Requirements: Super Admin's "untethered" access
(`platform.override`, checked only in `public.user_is_platform_admin()`,
`20260825100400`) bypasses the subscription lock and organization scoping —
but it is **not** unauthenticated and **not** unaudited. It is a permission
key on a real, signed-in account, provisioned only via the ungranted
`promote_to_super_admin()` SQL function (README runbook), and every sensitive
action it takes writes an `audit_logs` row through the same
`record_audit_event()` path as everyone else.
