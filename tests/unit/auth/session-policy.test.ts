import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  absoluteCapMs,
  evaluateSession,
  idleLimitMs,
  parseEpochMs,
  parsePolicy,
} from '@/lib/auth/session-policy'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const NOW = Date.UTC(2026, 8, 3, 12, 0, 0)

/** A live `long` session: started an hour ago, seen a minute ago. */
function session(overrides: Partial<Parameters<typeof evaluateSession>[0]> = {}) {
  return evaluateSession({
    policy: 'long',
    startedAt: String(NOW - HOUR),
    lastSeen: String(NOW - 60_000),
    now: NOW,
    ...overrides,
  })
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('parsePolicy', () => {
  it.each(['short', 'long'] as const)('accepts %s', (raw) => {
    expect(parsePolicy(raw)).toBe(raw)
  })

  it.each([undefined, '', 'LONG', 'forever', 'long ', '1'])('rejects %j', (raw) => {
    expect(parsePolicy(raw)).toBeNull()
  })
})

describe('parseEpochMs', () => {
  it('accepts a positive integer in the past', () => {
    expect(parseEpochMs(String(NOW - DAY), NOW)).toBe(NOW - DAY)
  })

  it.each([undefined, '', 'not-a-number', '-1', '0', '1.5', 'NaN', 'Infinity'])(
    'rejects %j',
    (raw) => {
      expect(parseEpochMs(raw, NOW)).toBeNull()
    },
  )

  it('tolerates small clock skew but rejects a far-future timestamp', () => {
    expect(parseEpochMs(String(NOW + 60_000), NOW)).toBe(NOW + 60_000)
    expect(parseEpochMs(String(NOW + DAY), NOW)).toBeNull()
  })
})

describe('idle limits and absolute caps diverge by policy', () => {
  it('long idles for 24h, short for 12h', () => {
    expect(idleLimitMs('long')).toBe(24 * HOUR)
    expect(idleLimitMs('short')).toBe(12 * HOUR)
  })

  it('long caps at 30 days, short at 12h', () => {
    expect(absoluteCapMs('long')).toBe(30 * DAY)
    expect(absoluteCapMs('short')).toBe(12 * HOUR)
  })
})

describe('evaluateSession', () => {
  it('allows a session inside both bounds', () => {
    expect(session()).toEqual({ status: 'ok' })
  })

  it('expires a long session idle for over 24h', () => {
    expect(session({ lastSeen: String(NOW - 25 * HOUR), startedAt: String(NOW - 26 * HOUR) })).toEqual(
      { status: 'expired', reason: 'idle' },
    )
  })

  it('keeps a long session alive at 23h idle', () => {
    expect(session({ lastSeen: String(NOW - 23 * HOUR), startedAt: String(NOW - 23 * HOUR) })).toEqual(
      { status: 'ok' },
    )
  })

  it('expires exactly at the idle limit, not one tick after', () => {
    const atLimit = session({
      lastSeen: String(NOW - 24 * HOUR),
      startedAt: String(NOW - 24 * HOUR),
    })
    const justInside = session({
      lastSeen: String(NOW - 24 * HOUR + 1),
      startedAt: String(NOW - 24 * HOUR),
    })
    expect(atLimit).toEqual({ status: 'expired', reason: 'idle' })
    expect(justInside).toEqual({ status: 'ok' })
  })

  it('expires a long session at the 30-day cap however active it has been', () => {
    expect(session({ startedAt: String(NOW - 31 * DAY), lastSeen: String(NOW - 1000) })).toEqual({
      status: 'expired',
      reason: 'cap',
    })
  })

  it("reports 'cap' rather than 'idle' when both bounds are blown", () => {
    expect(session({ startedAt: String(NOW - 40 * DAY), lastSeen: String(NOW - 40 * DAY) })).toEqual({
      status: 'expired',
      reason: 'cap',
    })
  })

  it('a short session dies at 13h even though last_seen is recent', () => {
    expect(
      session({ policy: 'short', startedAt: String(NOW - 13 * HOUR), lastSeen: String(NOW - 1000) }),
    ).toEqual({ status: 'expired', reason: 'cap' })
  })

  it('the same 13h-old session survives under the long policy', () => {
    expect(
      session({ policy: 'long', startedAt: String(NOW - 13 * HOUR), lastSeen: String(NOW - 1000) }),
    ).toEqual({ status: 'ok' })
  })

  it.each([
    ['an unknown policy', { policy: 'forever' }],
    ['a missing policy', { policy: undefined }],
    ['a malformed start', { startedAt: 'yesterday' }],
    ['a malformed last-seen', { lastSeen: '' }],
    ['a far-future start', { startedAt: String(NOW + DAY) }],
  ])('treats %s as expired rather than assuming the longer policy', (_label, overrides) => {
    expect(session(overrides)).toEqual({ status: 'expired', reason: 'malformed' })
  })
})

describe('env overrides (how CI exercises the timeout path without a 24h wait)', () => {
  it('shortens the long-policy idle window', () => {
    vi.stubEnv('MERQO_SESSION_IDLE_LONG_MS', String(5_000))
    expect(idleLimitMs('long')).toBe(5_000)
    expect(session({ lastSeen: String(NOW - 10_000) })).toEqual({
      status: 'expired',
      reason: 'idle',
    })
  })

  it('ignores a nonsensical override and falls back to the default', () => {
    vi.stubEnv('MERQO_SESSION_CAP_LONG_MS', 'soon')
    expect(absoluteCapMs('long')).toBe(30 * DAY)
  })
})
