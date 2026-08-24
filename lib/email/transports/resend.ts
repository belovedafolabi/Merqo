import {
  type EmailMessage,
  type EmailSendResult,
  type EmailTransport,
  EmailDeliveryError,
} from '../types'

/**
 * Resend, over its REST API.
 *
 * NO `resend` npm PACKAGE. The entire integration is one HTTP POST with a
 * bearer token and a JSON body; a dependency to wrap that would add a
 * supply-chain surface, a version to keep current, and an abstraction over an
 * abstraction — for a function that fits on a screen. The repo already takes
 * this position elsewhere (it hand-writes its PostgREST calls rather than
 * generating a client), and the cost discipline in
 * docs/milestones/README.md's cross-cutting concerns points the same way.
 *
 * This is the ONLY file in the codebase that names api.resend.com. A unit
 * test asserts that, so a second, parallel integration cannot be added
 * quietly — which is exactly the failure mode Milestone 11's Implementation
 * Notes warn about ("do not build a second, invitation-specific email
 * integration").
 */
const RESEND_ENDPOINT = 'https://api.resend.com/emails'

interface ResendSuccess {
  id: string
}

interface ResendFailure {
  message?: string
  name?: string
}

export function createResendTransport(apiKey: string, from: string): EmailTransport {
  return {
    name: 'resend',
    async send(message: EmailMessage): Promise<EmailSendResult> {
      let response: Response

      try {
        response = await fetch(RESEND_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
            ...(message.replyTo ? { reply_to: message.replyTo } : {}),
          }),
        })
      } catch (error) {
        // Network-level failure: DNS, TLS, timeout. Distinct from a 4xx —
        // this one is worth retrying, a rejected recipient is not.
        throw new EmailDeliveryError('Could not reach the email provider', 'resend', error)
      }

      if (!response.ok) {
        // Resend puts the actionable detail in `message`. The most common one
        // in a fresh account is the sandbox restriction: without a verified
        // sending domain, onboarding@resend.dev delivers only to the account
        // owner's own address and everything else comes back 403. Passing it
        // through unchanged is what lets the invite screen say something true.
        const failure = (await response.json().catch(() => ({}))) as ResendFailure
        throw new EmailDeliveryError(
          failure.message ?? `Email provider returned ${response.status}`,
          'resend',
        )
      }

      const payload = (await response.json()) as ResendSuccess
      return { id: payload.id ?? null, transport: 'resend' }
    },
  }
}
