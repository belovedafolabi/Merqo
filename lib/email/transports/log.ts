import { logger } from '@/lib/logger'

import type { EmailMessage, EmailSendResult, EmailTransport } from '../types'

/**
 * The zero-configuration transport: writes the message to the structured log
 * instead of sending it.
 *
 * This is what makes a fresh `git clone` and every CI job work with no
 * secrets. `.github/workflows/ci.yml` sets no RESEND_API_KEY on any job, so
 * every test run exercises this path — deliberately, since the alternative is
 * either mailing real people from CI or mocking the seam under test.
 *
 * It logs `text` in full, which is how the invite URL reaches a developer's
 * terminal on a local run. That is safe with lib/logger.ts's redactor: it
 * keys off PROPERTY NAMES matching /key|token|secret|password|.../ and `text`
 * is not one, so the body passes through intact. Worth stating explicitly,
 * because the body of an invitation email does contain a token — the
 * redaction rule just does not reach inside a value to find it. In an
 * environment where that matters, set RESEND_API_KEY and this transport is
 * never selected.
 */
export function createLogTransport(): EmailTransport {
  return {
    name: 'log',
    async send(message: EmailMessage): Promise<EmailSendResult> {
      logger.info('email.sent_via_log', {
        to: message.to,
        subject: message.subject,
        text: message.text,
      })
      return { id: null, transport: 'log' }
    },
  }
}
