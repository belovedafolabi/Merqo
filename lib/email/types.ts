/**
 * The transactional-email contract.
 *
 * Milestone 11 introduces this layer even though the roadmap lists Resend
 * under Milestone 12, because Milestone 11's Implementation Notes are
 * explicit: "Coordinate the email-sending path with Milestone 12 so there is
 * exactly one shared EmailService/NotificationService layer — do not build a
 * second, invitation-specific email integration." Building the seam now and
 * letting Milestone 12 layer NotificationService on top of it is the only
 * ordering that honors that, since invitations need to send first.
 *
 * The layering is docs/TAS.md §33's:
 *
 *   SubscriptionService ─┐
 *   Milestone 11 invites ─┼─> NotificationService (M12) ─> EmailService ─> Resend
 *   Low-stock alerts     ─┘                                (this module)
 *
 * Business logic never calls Resend directly. Today that means
 * lib/employees/mutations.ts calls sendEmail(); when Milestone 12 lands it
 * will call NotificationService instead, and nothing in this module changes.
 */

/** A rendered message, ready to send. Templates produce these; transports consume them. */
export interface EmailMessage {
  to: string
  subject: string
  /** Both bodies are always supplied. `text` is not a fallback — it is what
   *  a plain-text client, a screen reader, and the local log transport show,
   *  so any link that matters must appear in it too. */
  html: string
  text: string
  replyTo?: string
}

export type EmailTransportName = 'resend' | 'log'

export interface EmailSendResult {
  /** The provider's message id, or null for the log transport, which has none. */
  id: string | null
  transport: EmailTransportName
}

/**
 * The one interface a provider must satisfy. Swapping Resend for anything
 * else is a new file under transports/ and one line in resolveEmailTransport().
 */
export interface EmailTransport {
  readonly name: EmailTransportName
  send(message: EmailMessage): Promise<EmailSendResult>
}

/**
 * Thrown when a message could not be handed to the provider.
 *
 * Carries the provider's own message verbatim rather than a generic string:
 * Resend's sandbox restriction ("You can only send testing emails to your own
 * email address") is the difference between a misconfiguration and an outage,
 * and flattening it would hide that from whoever is reading the logs.
 */
export class EmailDeliveryError extends Error {
  constructor(
    message: string,
    readonly transport: EmailTransportName,
    override readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'EmailDeliveryError'
  }
}
