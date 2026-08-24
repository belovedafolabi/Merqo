import { createHash, randomBytes } from 'node:crypto'

/**
 * Invitation-token mechanics, per Milestone 11's Security Requirements:
 * "invitation tokens are single-use, time-limited, and unguessable
 * (cryptographically random)."
 *
 * Each property is owned by a different layer, and it is worth being clear
 * about which lives where:
 *
 *   unguessable  — here (randomBytes, 256 bits)
 *   time-limited — here (INVITATION_TTL_DAYS) and re-checked in Postgres by
 *                  accept_employee_invitation(), because a client-side expiry
 *                  is a suggestion
 *   single-use   — Postgres only (SELECT ... FOR UPDATE + accepted_at), since
 *                  it is a concurrency property and cannot be decided here
 *
 * Pure and dependency-free apart from node:crypto, so it unit-tests without a
 * database.
 */

/**
 * Seven days. Long enough to survive a weekend and a spam folder, short
 * enough that a link forwarded and forgotten stops working. Restarting is
 * one click ("Resend") for whoever sent it.
 */
export const INVITATION_TTL_DAYS = 7

/**
 * 32 bytes = 256 bits from the OS CSPRNG, base64url-encoded to 43 characters.
 *
 * base64url rather than hex: same entropy, two-thirds the length, and it is
 * URL-safe without escaping, so the token survives being pasted into a
 * browser bar, an email client's link rewriter, and a chat app.
 *
 * randomBytes, never Math.random: this value is a credential that grants
 * access to an organization.
 */
export function generateInvitationToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * What actually gets stored (employee_invitations.token_hash) and what every
 * RPC takes as its argument.
 *
 * Plain SHA-256 with no salt and no work factor — correct here, and worth
 * saying why, since it would be wrong for a password. A password is
 * low-entropy and guessable, so it needs a slow, salted KDF to make guessing
 * expensive. This token is 256 bits of uniform randomness: there is nothing
 * to guess, and the only thing hashing has to do is make a stolen database
 * row non-replayable. A KDF would add latency to every invite lookup for a
 * threat model that does not apply.
 */
export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function invitationExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000)
}

/**
 * The link the invitee clicks. Built from NEXT_PUBLIC_APP_URL — the canonical
 * public URL of this deployment (.env.example, Milestone 01) — rather than
 * from request headers, which an attacker controls and which would let a
 * poisoned Host header redirect a live invite token to their own server.
 */
export function invitationUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return `${base.replace(/\/$/, '')}/invite/${token}`
}
