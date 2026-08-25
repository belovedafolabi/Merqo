import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetEmailTransport, sendEmail } from '@/lib/email/service'
import { EmailDeliveryError } from '@/lib/email/types'

const MESSAGE = { to: 'owner@example.com', subject: 'Test', html: '<p>Hi</p>', text: 'Hi' }

/**
 * Milestone 11's Observability requirement: "structured logging for
 * invitation email send failures (so a failed invite is noticeable, not
 * silent)." These tests exercise sendEmail()'s two guarantees directly —
 * every failure is both logged and rethrown, never one without the other —
 * plus the zero-secret fallback and the single-integration-point rule.
 *
 * Statically imported (no vi.resetModules() + dynamic re-import): the
 * memoized transport is reset via resetEmailTransport() instead, which is
 * why that export exists. Re-importing the module per test would create a
 * fresh EmailDeliveryError class each time, breaking `instanceof` against
 * this file's own top-level import — a different module instance, not a
 * different value.
 */
describe('lib/email/service', () => {
  const originalKey = process.env.RESEND_API_KEY
  let errorSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetEmailTransport()
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    if (originalKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = originalKey
    resetEmailTransport()
  })

  it('falls back to the log transport, with a warning, when RESEND_API_KEY is unset', async () => {
    delete process.env.RESEND_API_KEY

    const result = await sendEmail(MESSAGE)

    expect(result.transport).toBe('log')
    expect(result.id).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('email.transport_fallback_log'))
  })

  it('a failing transport is both logged and rethrown as EmailDeliveryError — never one without the other', async () => {
    process.env.RESEND_API_KEY = 're_test_key'

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          message: 'You can only send testing emails to your own email address',
        }),
      }),
    )

    await expect(sendEmail(MESSAGE)).rejects.toBeInstanceOf(EmailDeliveryError)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('email.send_failed'))

    // A second call, asserted separately: the first call already consumed
    // the mocked fetch's single resolved value in some mock configurations,
    // so re-asserting message content against the same stubbed response here
    // (rather than chaining two expectations off one call) keeps this
    // resilient to that.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          message: 'You can only send testing emails to your own email address',
        }),
      }),
    )
    await expect(sendEmail(MESSAGE)).rejects.toThrow(
      'You can only send testing emails to your own email address',
    )
  })

  // The "api.resend.com named in exactly one file" check that used to live
  // here is now tests/unit/email/layering.test.ts — generalised to a
  // repo-wide sweep (lib/, app/, components/) plus an import-statement check,
  // per Milestone 12's Definition of Done. Superseding it here rather than
  // keeping both avoids two checks that could silently drift apart.
})
