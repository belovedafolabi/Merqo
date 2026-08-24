import { describe, expect, it } from 'vitest'

import {
  INVITATION_TTL_DAYS,
  generateInvitationToken,
  hashInvitationToken,
  invitationExpiry,
  invitationUrl,
} from '@/lib/employees/invitations'

describe('generateInvitationToken', () => {
  it('produces a URL-safe, sufficiently long, unique token each call', () => {
    const a = generateInvitationToken()
    const b = generateInvitationToken()

    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThanOrEqual(40) // 32 bytes base64url ~= 43 chars
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe('hashInvitationToken', () => {
  it('is deterministic and never equal to its input', () => {
    const token = generateInvitationToken()
    expect(hashInvitationToken(token)).toBe(hashInvitationToken(token))
    expect(hashInvitationToken(token)).not.toBe(token)
  })

  it('is a 64-character hex SHA-256 digest', () => {
    expect(hashInvitationToken('anything')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('different tokens hash to different digests', () => {
    expect(hashInvitationToken(generateInvitationToken())).not.toBe(
      hashInvitationToken(generateInvitationToken()),
    )
  })
})

describe('invitationExpiry', () => {
  it('is INVITATION_TTL_DAYS after the given time', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const expiry = invitationExpiry(now)
    expect(expiry.getTime() - now.getTime()).toBe(INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000)
  })
})

describe('invitationUrl', () => {
  it('builds a /invite/<token> link off NEXT_PUBLIC_APP_URL, trimming a trailing slash', () => {
    const original = process.env.NEXT_PUBLIC_APP_URL
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.com/'
    expect(invitationUrl('tok123')).toBe('https://example.com/invite/tok123')
    process.env.NEXT_PUBLIC_APP_URL = original
  })
})
