import {
  type InitializeTransactionInput,
  type InitializeTransactionResult,
  type PaystackTransactionStatus,
  type PaystackTransport,
  type VerifyTransactionResult,
  PaystackError,
} from '../types'

/**
 * Paystack, over its REST API.
 *
 * NO `paystack` npm PACKAGE — two HTTP calls with a bearer token, same
 * reasoning lib/email/transports/resend.ts already gives for hand-writing
 * Resend's call rather than depending on a wrapper.
 *
 * This is the ONLY file in the codebase that names Paystack's API host. A
 * unit test (tests/unit/paystack/layering.test.ts) asserts that, mirroring
 * tests/unit/email/layering.test.ts's equivalent assertion for Resend's own
 * endpoint — so a second, parallel payment integration cannot be added
 * quietly.
 */
const PAYSTACK_ENDPOINT = 'https://api.paystack.co'

interface PaystackInitializeResponse {
  status: boolean
  message: string
  data?: {
    authorization_url: string
    access_code: string
    reference: string
  }
}

interface PaystackVerifyResponse {
  status: boolean
  message: string
  data?: {
    reference: string
    status: string
    amount: number
    currency: string
    id: number
    paid_at: string | null
    [key: string]: unknown
  }
}

function toTransactionStatus(status: string): PaystackTransactionStatus {
  if (status === 'success') return 'success'
  if (status === 'abandoned') return 'abandoned'
  return 'failed'
}

export function createPaystackTransport(secretKey: string): PaystackTransport {
  async function call<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response
    try {
      response = await fetch(`${PAYSTACK_ENDPOINT}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
          ...init.headers,
        },
      })
    } catch (error) {
      // Network-level failure: DNS, TLS, timeout — distinct from an HTTP
      // error response. The caller (lib/subscription/settlement.ts) treats
      // this as 'unavailable', not 'rejected': Paystack never actually
      // adjudicated the payment, so retrying later can still succeed.
      throw new PaystackError('Could not reach Paystack', 'network', error)
    }

    const body = (await response.json().catch(() => ({}))) as { status?: boolean; message?: string }

    if (!response.ok || body.status === false) {
      throw new PaystackError(body.message ?? `Paystack returned ${response.status}`, 'http')
    }

    return body as T
  }

  return {
    async initializeTransaction(
      input: InitializeTransactionInput,
    ): Promise<InitializeTransactionResult> {
      const body = await call<PaystackInitializeResponse>('/transaction/initialize', {
        method: 'POST',
        body: JSON.stringify({
          reference: input.reference,
          amount: input.amountMinor,
          currency: input.currency,
          email: input.email,
          callback_url: input.callbackUrl,
          metadata: input.metadata ?? {},
        }),
      })

      if (!body.data) {
        throw new PaystackError('Paystack initialize response had no data', 'http')
      }

      return {
        authorizationUrl: body.data.authorization_url,
        accessCode: body.data.access_code,
        reference: body.data.reference,
      }
    },

    async verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
      const body = await call<PaystackVerifyResponse>(
        `/transaction/verify/${encodeURIComponent(reference)}`,
        { method: 'GET' },
      )

      if (!body.data) {
        throw new PaystackError('Paystack verify response had no data', 'http')
      }

      return {
        reference: body.data.reference,
        status: toTransactionStatus(body.data.status),
        amountMinor: body.data.amount,
        currency: body.data.currency,
        transactionId: body.data.id,
        paidAt: body.data.paid_at,
        raw: body.data,
      }
    },
  }
}
