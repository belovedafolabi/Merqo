import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetEmailTransport } from '@/lib/email/service'
import { deliverEmail } from '@/lib/notifications/service'

/**
 * The one true end-to-end test against Resend's actual API the milestone's
 * Testing Requirements ask for: "at least one true end-to-end test against
 * Resend's actual API in a controlled test environment."
 *
 * OPT-IN, NOT REQUIRED. Skips itself unless BOTH RESEND_API_KEY and
 * RESEND_TEST_RECIPIENT are set (see .env.example), so `pnpm test:integration`
 * stays green with zero new secrets on a fresh clone or in CI as it stands
 * today — no change to .github/workflows/ci.yml. Set both locally, or add
 * them as CI secrets later, to actually exercise this against the real
 * Resend sandbox.
 *
 * RESEND_TEST_RECIPIENT exists as its own variable, distinct from any
 * account-owner email inferred elsewhere, because Resend's shared
 * onboarding@resend.dev sender only delivers to the account owner's own
 * login address (lib/email/transports/resend.ts's header) — this must be
 * that address for the test to actually deliver rather than 403.
 */
const RESEND_API_KEY = process.env.RESEND_API_KEY
const RESEND_TEST_RECIPIENT = process.env.RESEND_TEST_RECIPIENT
const live = Boolean(RESEND_API_KEY && RESEND_TEST_RECIPIENT)

describe.skipIf(!live)('live Resend delivery (opt-in)', () => {
  beforeEach(() => {
    resetEmailTransport()
  })

  afterEach(() => {
    resetEmailTransport()
  })

  it('sends a real low-stock alert email and gets back a provider message id', async () => {
    const outcome = await deliverEmail(RESEND_TEST_RECIPIENT!, {
      type: 'inventory.low_stock',
      data: {
        productName: 'Integration Test Widget',
        sku: 'ITW-1',
        branchName: 'Test Branch',
        quantity: 1,
        threshold: 5,
        href: '/inventory',
      },
    })

    expect(outcome.delivered).toBe(true)
    if (outcome.delivered) {
      expect(outcome.transport).toBe('resend')
      expect(outcome.id).not.toBeNull()
    }
  })
})
