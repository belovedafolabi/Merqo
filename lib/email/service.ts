import { logger } from '@/lib/logger'

import { createLogTransport } from './transports/log'
import { createResendTransport } from './transports/resend'
import {
  type EmailMessage,
  type EmailSendResult,
  type EmailTransport,
  EmailDeliveryError,
} from './types'

/**
 * EmailService — the single outbound-email seam (see ./types.ts for the
 * layering this sits inside).
 *
 * Server-side only. RESEND_API_KEY is read here, and it is deliberately not
 * NEXT_PUBLIC_-prefixed, so Next.js never inlines it into a client bundle —
 * the variable is simply undefined in the browser, which is .env.example's
 * rule 2 ("anything named NEXT_PUBLIC_* is shipped to the browser; never put
 * a secret behind that prefix") doing its job. The `server-only` package
 * would turn a bad import into a build error rather than a runtime surprise,
 * but it is not a dependency of this repo and one HTTP call does not justify
 * adding it; every caller of this module is a Server Action or a mutation
 * module that is already server-only by construction.
 */

/** Resend's shared sandbox sender, usable with no DNS setup — and with the
 *  matching restriction that it only delivers to the Resend account owner's
 *  own address. Overridden by RESEND_FROM_EMAIL once a domain is verified. */
const DEFAULT_FROM_EMAIL = 'onboarding@resend.dev'

let cachedTransport: EmailTransport | null = null

/**
 * Picks the transport from the environment, once per process.
 *
 * Memoized so the fallback warning is logged a single time rather than on
 * every invitation — a line that repeats per-request stops being read.
 * Exported for the unit tests, which reset it between cases.
 */
export function resolveEmailTransport(): EmailTransport {
  if (cachedTransport) return cachedTransport

  const apiKey = process.env.RESEND_API_KEY

  if (apiKey) {
    cachedTransport = createResendTransport(
      apiKey,
      process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM_EMAIL,
    )
  } else {
    logger.warn('email.transport_fallback_log', {
      reason: 'RESEND_API_KEY is not set; messages will be logged rather than sent',
    })
    cachedTransport = createLogTransport()
  }

  return cachedTransport
}

/** Test seam: drops the memoized transport so the next call re-reads the env. */
export function resetEmailTransport(): void {
  cachedTransport = null
}

/**
 * Send one message.
 *
 * NEVER SWALLOWS. Milestone 11's Observability section asks for "structured
 * logging for invitation email send failures (so a failed invite is
 * noticeable, not silent)" — so a failure is logged here, where the transport
 * name and the provider's own message are both in hand, and then rethrown.
 *
 * Logging and rethrowing rather than choosing between them is the point: this
 * layer knows that a send failed, but not what that means. For an invitation
 * it means "show the admin the copy-link fallback and carry on" — the invite
 * row is already committed. For a future payment receipt it might mean
 * something else entirely. That decision belongs to the caller, so the error
 * has to reach them.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailSendResult> {
  const transport = resolveEmailTransport()

  try {
    return await transport.send(message)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)

    logger.error('email.send_failed', {
      transport: transport.name,
      to: message.to,
      subject: message.subject,
      reason,
    })

    if (error instanceof EmailDeliveryError) throw error
    throw new EmailDeliveryError(reason, transport.name, error)
  }
}
