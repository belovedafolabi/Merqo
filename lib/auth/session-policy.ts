/**
 * Session lifetime arithmetic, per docs/milestones/17-post-launch-enhancements.md
 * Part C. Deliberately pure: no `next/*`, no Supabase, no `Date` formatting —
 * only UTC epoch milliseconds in, a verdict out. That keeps proxy.ts free of
 * bare millisecond literals, makes every boundary case unit-testable without a
 * request context, and means the module is safe if it is ever pulled into a
 * client bundle.
 *
 * Two policies, chosen by the "remember me" checkbox at sign-in:
 *   - `short` (default, unticked): browser-session cookies, ~12h idle and a 12h
 *     absolute cap. The cap is what makes "ends when you close the browser"
 *     deterministic even for a laptop whose lid never shuts.
 *   - `long`  (ticked): 24h rolling idle, 30-day absolute cap. A user who works
 *     daily is never interrupted; a forgotten device still dies.
 *
 * These are the APP-level bound. The hard, server-side bound is Supabase Auth's
 * own `[auth.sessions] timebox` / `inactivity_timeout` (supabase/config.toml,
 * and the matching per-project setting in docs/milestones/16-launch/client-provisioning.md).
 * That is why the cookies these values are read from need not be signed: the
 * worst a tampering user achieves is shortening their own session or forcing a
 * re-login, and deleting the cookies cannot reach the Supabase-side limit.
 *
 * Test overrides: each duration reads an env var so CI can exercise the timeout
 * path without a 24-hour wait. The reads are written as static
 * `process.env.LITERAL` accesses on purpose — Next inlines those at build time,
 * and a dynamic `process.env[key]` lookup would not survive the build. Playwright's
 * webServer runs `pnpm build && pnpm start` inside the test run, so exporting the
 * override before `pnpm test:e2e` is enough for it to take effect.
 */

export type SessionPolicy = 'short' | 'long'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** How long a session may sit idle before it is signed out. */
const DEFAULT_IDLE_MS: Record<SessionPolicy, number> = {
  short: 12 * HOUR_MS,
  long: 24 * HOUR_MS,
}

/** How long a session may live in total, however active it stays. */
const DEFAULT_CAP_MS: Record<SessionPolicy, number> = {
  short: 12 * HOUR_MS,
  long: 30 * DAY_MS,
}

/**
 * A timestamp slightly in the future is ordinary clock skew between the browser
 * and the server, not tampering. Beyond this we treat the cookie as malformed
 * rather than silently granting an extended session.
 */
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000

export const SESSION_COOKIES = {
  policy: 'merqo_sess_policy',
  start: 'merqo_sess_start',
  lastSeen: 'merqo_last_seen',
} as const

export type SessionExpiryReason = 'idle' | 'cap' | 'malformed'

export type SessionVerdict = { status: 'ok' } | { status: 'expired'; reason: SessionExpiryReason }

function parsePositiveInt(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const value = Number(raw)
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) return null
  return value
}

export function idleLimitMs(policy: SessionPolicy): number {
  const raw =
    policy === 'short'
      ? process.env.MERQO_SESSION_IDLE_SHORT_MS
      : process.env.MERQO_SESSION_IDLE_LONG_MS
  return parsePositiveInt(raw) ?? DEFAULT_IDLE_MS[policy]
}

export function absoluteCapMs(policy: SessionPolicy): number {
  const raw =
    policy === 'short'
      ? process.env.MERQO_SESSION_CAP_SHORT_MS
      : process.env.MERQO_SESSION_CAP_LONG_MS
  return parsePositiveInt(raw) ?? DEFAULT_CAP_MS[policy]
}

/**
 * Strict allow-list. Anything else — a truncated cookie, a hand-edited value,
 * a stale name from an older release — is not a policy, and the caller must
 * treat it as expired rather than defaulting to the more permissive `long`.
 */
export function parsePolicy(raw: string | undefined): SessionPolicy | null {
  return raw === 'short' || raw === 'long' ? raw : null
}

/**
 * Epoch milliseconds, UTC. Never `new Date(raw)` — that would accept date
 * strings and drag local time and DST into session arithmetic.
 */
export function parseEpochMs(raw: string | undefined, now: number): number | null {
  const value = parsePositiveInt(raw)
  if (value === null) return null
  if (value > now + CLOCK_SKEW_TOLERANCE_MS) return null
  return value
}

/**
 * The whole decision, in one place. Anything unparseable is `expired` with
 * reason `malformed` — the fail-safe direction is always "make them sign in
 * again", never "assume the longer policy".
 */
export function evaluateSession(input: {
  policy: string | undefined
  startedAt: string | undefined
  lastSeen: string | undefined
  now: number
}): SessionVerdict {
  const policy = parsePolicy(input.policy)
  if (policy === null) return { status: 'expired', reason: 'malformed' }

  const startedAt = parseEpochMs(input.startedAt, input.now)
  const lastSeen = parseEpochMs(input.lastSeen, input.now)
  if (startedAt === null || lastSeen === null) return { status: 'expired', reason: 'malformed' }

  // Cap first: a session past its absolute limit is over regardless of how
  // recently it was used, and reporting `cap` rather than `idle` keeps the
  // structured log honest about which bound actually fired.
  if (input.now - startedAt >= absoluteCapMs(policy)) return { status: 'expired', reason: 'cap' }
  if (input.now - lastSeen >= idleLimitMs(policy)) return { status: 'expired', reason: 'idle' }

  return { status: 'ok' }
}
