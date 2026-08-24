import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetEmailTransport } from '@/lib/email/service'
import { deliverEmail } from '@/lib/notifications/service'

/**
 * Testing Requirement 1 ("NotificationService correctly routes to in-app/
 * email based on type/preference"), exercised at the unit boundary
 * deliverEmail() actually controls. The routing decision itself — whose
 * preference wins, mandatory-category bypass — lives in SQL
 * (public.resolve_notification_recipients, public.notify_low_stock) and is
 * proven in tests/integration/notifications.test.ts against a real
 * database; these tests cover what stays true regardless of that decision:
 * deliverEmail() never throws, and a provider failure surfaces as a real
 * reason string rather than a generic one.
 *
 * Statically imported, resetEmailTransport() between tests — same
 * discipline as tests/unit/email/service.test.ts's header explains (no
 * vi.mock()/vi.resetModules(), which would break `instanceof` against a
 * fresh module instance).
 */
describe('lib/notifications/service — deliverEmail', () => {
  const originalKey = process.env.RESEND_API_KEY
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetEmailTransport()
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    if (originalKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = originalKey
    resetEmailTransport()
  })

  it('a successful send resolves { delivered: true } with the provider id', async () => {
    process.env.RESEND_API_KEY = 're_test_key'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'email_123' }) }),
    )

    const outcome = await deliverEmail('owner@example.com', {
      type: 'inventory.low_stock',
      data: {
        productName: 'Widget',
        sku: 'W-1',
        branchName: 'Main',
        quantity: 1,
        threshold: 5,
        href: '/inventory',
      },
    })

    expect(outcome).toEqual({ delivered: true, id: 'email_123', transport: 'resend' })
  })

  it('a provider failure NEVER throws — resolves { delivered: false } with the provider message verbatim', async () => {
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

    const outcome = await deliverEmail('someone-else@example.com', {
      type: 'inventory.low_stock',
      data: {
        productName: 'Widget',
        sku: null,
        branchName: 'Main',
        quantity: 1,
        threshold: 5,
        href: '/inventory',
      },
    })

    expect(outcome).toEqual({
      delivered: false,
      reason: 'You can only send testing emails to your own email address',
    })
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('notification.email_failed'))
  })

  it('falls back to the log transport (delivered: true, id: null) when RESEND_API_KEY is unset', async () => {
    delete process.env.RESEND_API_KEY

    const outcome = await deliverEmail('owner@example.com', {
      type: 'employee.role_changed',
      data: { roleName: 'Manager', organizationName: 'Acme', href: '/settings/organization' },
    })

    expect(outcome).toEqual({ delivered: true, id: null, transport: 'log' })
  })
})
