import type { EmailTransportName } from '@/lib/email/types'
import { sendEmail } from '@/lib/email/service'
import { EmailDeliveryError } from '@/lib/email/types'
import { logger } from '@/lib/logger'

import { renderNotificationEmail, type NotificationEmailData } from './templates'

/**
 * NotificationService's email half — the layer docs/TAS.md §33 draws as
 * `... -> NotificationService -> EmailService -> Resend`.
 *
 * EmailService (lib/email/service.ts's sendEmail()) keeps throwing — that is
 * still correct for it, since it has no opinion on what a failure means.
 * This layer is where a throw becomes a value, and that single rule is what
 * reconciles two requirements that look like they conflict:
 *
 *   - the milestone's hard invariant: "notification failure must never fail
 *     or roll back the triggering business operation" — satisfied by never
 *     throwing, so no call site needs a try/catch and none can forget one.
 *   - Milestone 11's invitation flow needs to KNOW a send failed, to show
 *     the copy-link fallback banner instead of claiming the email went out.
 *
 * Returning a discriminated outcome satisfies both: the caller who cares
 * (inviteEmployee) reads outcome.delivered; every other caller can ignore
 * the return value entirely and the guarantee still holds.
 */

export type EmailOutcome =
  | { delivered: true; id: string | null; transport: EmailTransportName }
  | { delivered: false; reason: string }

/**
 * Render and send one transactional email. NEVER THROWS.
 *
 * sendEmail() already logs a failure once (transport + reason); this layer
 * additionally logs the notification-level event name so a delivery failure
 * is findable by grepping "notification." rather than only "email.".
 */
export async function deliverEmail(to: string, input: NotificationEmailData): Promise<EmailOutcome> {
  try {
    const message = renderNotificationEmail(input)
    const result = await sendEmail({ to, ...message })
    return { delivered: true, id: result.id, transport: result.transport }
  } catch (error) {
    const reason =
      error instanceof EmailDeliveryError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'The notification email could not be sent.'

    logger.error('notification.email_failed', { to, type: input.type, reason })
    return { delivered: false, reason }
  }
}

export interface NotifyResult {
  inAppCreated: number
  emailsSent: number
  emailsFailed: number
}

/**
 * Sends one email per recipient row returned by a notify_*() RPC
 * (public.notify_low_stock / public.notify_role_assigned), tallying the
 * result. Shared by lib/notifications/low-stock.ts and
 * lib/notifications/role-changed.ts so the "never throws, always tally"
 * contract is written once.
 *
 * `insertedCount` is passed in rather than re-derived from `rows.length`
 * because a notify_*() RPC's returned rows are only the ones eligible for
 * EMAIL (email_enabled = true) — a row can be inserted in-app and still be
 * absent here because the recipient turned email off for that category. The
 * caller knows the true in-app count from the RPC's full result set.
 */
export async function deliverNotificationEmails<T extends { email: string }>(
  rows: readonly T[],
  toEmailData: (row: T) => NotificationEmailData,
  insertedCount: number,
): Promise<NotifyResult> {
  const outcomes = await Promise.allSettled(
    rows.map((row) => deliverEmail(row.email, toEmailData(row))),
  )

  let emailsSent = 0
  let emailsFailed = 0
  for (const outcome of outcomes) {
    // deliverEmail() never rejects, so the 'rejected' branch below is
    // unreachable in practice — kept only so a future change to
    // deliverEmail() that reintroduces a throw fails safe (counted as a
    // failure) rather than losing the tally.
    if (outcome.status === 'fulfilled' && outcome.value.delivered) emailsSent += 1
    else emailsFailed += 1
  }

  return { inAppCreated: insertedCount, emailsSent, emailsFailed }
}
