/**
 * The Paystack integration contract.
 *
 * Mirrors lib/email/types.ts's shape deliberately: a pure interface
 * (`PaystackTransport`), a service layer that resolves it from the
 * environment, and exactly one file that speaks HTTP to the provider
 * (transports/paystack.ts). Per docs/PRD.md §17 / §37, Paystack is used
 * exclusively for this platform's own subscription billing — never POS
 * customer payments — so this module has exactly two operations: start a
 * checkout, and verify one server-side.
 */

export interface InitializeTransactionInput {
  /** Our own generated reference (lib/paystack/reference.ts) — never one Paystack assigns. */
  reference: string
  /** Kobo (or the smallest unit of `currency`) — Paystack's own accounting unit. */
  amountMinor: number
  currency: string
  email: string
  /** Where Paystack redirects the browser after checkout completes. */
  callbackUrl: string
  metadata?: Record<string, unknown>
}

export interface InitializeTransactionResult {
  authorizationUrl: string
  accessCode: string
  reference: string
}

export type PaystackTransactionStatus = 'success' | 'failed' | 'abandoned'

export interface VerifyTransactionResult {
  reference: string
  status: PaystackTransactionStatus
  amountMinor: number
  currency: string
  transactionId: number
  paidAt: string | null
  /** Paystack's raw response body, persisted as-is into subscription_payments.verification_response. */
  raw: Record<string, unknown>
}

/**
 * The one interface a payment provider must satisfy. Swapping Paystack for
 * anything else is a new file under transports/ and one line in
 * resolvePaystackTransport().
 */
export interface PaystackTransport {
  initializeTransaction(input: InitializeTransactionInput): Promise<InitializeTransactionResult>
  verifyTransaction(reference: string): Promise<VerifyTransactionResult>
}

/**
 * Thrown when Paystack could not be reached, or responded with something
 * this integration cannot interpret. Carries Paystack's own message where
 * available, same reasoning as EmailDeliveryError: a misconfiguration and an
 * outage need to look different in the logs.
 */
export class PaystackError extends Error {
  constructor(
    message: string,
    readonly kind: 'network' | 'http' | 'unavailable',
    override readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'PaystackError'
  }
}
