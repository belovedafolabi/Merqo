import { createHash } from 'node:crypto'

import { NextResponse, type NextRequest } from 'next/server'

import { logger } from '@/lib/logger'
import { recordUnauthenticatedAuditEvent } from '@/lib/auth/audit'
import { consumeRateLimit } from '@/lib/rate-limit/limiter'
import { verifyPaystackSignature } from '@/lib/paystack/signature'
import { resolvePaystackWebhookSecret } from '@/lib/paystack/service'
import { settlePaystackPayment } from '@/lib/subscription/settlement'
import { markWebhookEvent, recordWebhookEvent } from '@/lib/subscription/webhook-ledger'
import { createAnonSupabaseClient } from '@/lib/supabase/server'

export const runtime = 'nodejs' // node:crypto is required for signature verification
export const dynamic = 'force-dynamic'

/**
 * Paystack's webhook receiver
 * (docs/milestones/13-subscription-billing-and-platform-admin.md API/Backend
 * Changes: "Route Handler: Paystack webhook receiver (signature
 * verification, idempotency check, server-side payment verification,
 * subscription extension, audit event, notification trigger)").
 *
 * Already public: proxy.ts's isPublicPath() exempts every /api/* route, and
 * this endpoint has no user session to authenticate against anyway —
 * Paystack itself is the caller. The signature check below is the entire
 * authentication boundary.
 *
 * ORDER MATTERS. Do not reorder these steps:
 *
 *   1. Read the RAW body text FIRST, before any parsing. The HMAC signature
 *      is over the exact bytes Paystack sent — JSON.stringify(await
 *      request.json()) does NOT reproduce that (key order/whitespace
 *      differ), and a request body can only be read once.
 *   2. Verify the signature against those raw bytes. A payload that fails
 *      verification is rejected outright — 401, logged, audited — never
 *      parsed or trusted for anything.
 *   2a. Rate-limit (Milestone 15). AFTER the signature check by design, so
 *      the bucket governs signed retry storms rather than anonymous floods —
 *      see the comment at the call site.
 *   3. Record the delivery in webhook_events for idempotency (the cheap,
 *      second guard — see that table's comment). A duplicate short-circuits
 *      here with 200, no further processing.
 *   4. Non-charge.success events are acknowledged and ignored.
 *   5. settlePaystackPayment() — the SAME function the browser-callback path
 *      uses — does verification + extension. Its outcome maps to a response
 *      code: 'extended'/'duplicate' -> 200 (done); 'rejected' -> 200
 *      (Paystack adjudicated definitively; retrying cannot help); 'unavailable'
 *      -> 500 (our own verify call failed; Paystack SHOULD retry).
 *
 * Every branch logs under the paystack.webhook_* prefix (Observability:
 * "structured logging on webhook processing — received, verified, rejected,
 * processed").
 */
export async function POST(request: NextRequest) {
  const raw = await request.text()
  const signatureHeader = request.headers.get('x-paystack-signature')
  const secret = resolvePaystackWebhookSecret()

  const clientIp = (request.headers.get('x-forwarded-for')?.split(',')[0] ?? '').trim() || null

  if (!secret || !verifyPaystackSignature(raw, signatureHeader, secret)) {
    logger.error('paystack.webhook_rejected', { reason: 'invalid_signature' })
    // This path has no session at all, not even a cookie to read, so it uses
    // the narrow record_unauthenticated_audit_event() RPC. Until Milestone
    // 15 it called the general record_audit_event(), which was granted to
    // anon (20260822093500) — a grant that also let anyone holding the
    // public anon key forge audit rows for any organization. That grant is
    // revoked; see supabase/migrations/20260826090200.
    //
    // createAnonSupabaseClient() avoids createServerSupabaseClient()'s
    // next/headers cookies() call, which this caller has no use for (see
    // that function's own doc). The RPC rate-limits itself in SQL, so an
    // unsigned flood cannot use this branch to fill audit_logs.
    await recordUnauthenticatedAuditEvent(
      {
        action: 'subscription.webhook_rejected',
        ipAddress: clientIp,
        userAgent: request.headers.get('user-agent'),
      },
      createAnonSupabaseClient(),
    )
    return NextResponse.json({ received: false }, { status: 401 })
  }

  // Deliberately AFTER signature verification, not before. An unsigned flood
  // is already rejected above having cost nothing but an HMAC, so limiting
  // it here would only add a database round trip to the cheapest branch.
  // What this bucket actually governs is a legitimately-signed retry storm —
  // Paystack redelivering faster than settlement can keep up — and 429 with
  // Retry-After is the correct answer to that. The webhook_events
  // idempotency ledger below makes the eventual retry safe to replay.
  if (!(await consumeRateLimit(createAnonSupabaseClient(), 'webhook', clientIp))) {
    logger.warn('paystack.webhook_rate_limited', { ip: clientIp })
    return NextResponse.json({ received: false }, { status: 429, headers: { 'Retry-After': '60' } })
  }

  let payload: { event?: string; data?: { reference?: string; id?: number } }
  try {
    payload = JSON.parse(raw)
  } catch {
    logger.error('paystack.webhook_rejected', { reason: 'invalid_json' })
    return NextResponse.json({ received: false }, { status: 400 })
  }

  const eventType = payload.event ?? 'unknown'
  const reference = payload.data?.reference ?? null
  // Paystack has no stable per-DELIVERY id — data.id is the underlying
  // transaction id and repeats across every event for that transaction. A
  // body-hash fallback covers the rare payload carrying neither.
  const eventId = `${eventType}:${payload.data?.id ?? createHash('sha256').update(raw).digest('hex')}`

  let eventRow: { eventRowId: string; isDuplicate: boolean }
  try {
    eventRow = await recordWebhookEvent({
      provider: 'paystack',
      eventId,
      eventType,
      reference,
      payload,
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    logger.error('paystack.webhook_error', { reason, eventId })
    return NextResponse.json({ received: false }, { status: 500 })
  }

  if (eventRow.isDuplicate) {
    logger.info('paystack.webhook_duplicate', { eventId, eventType })
    return NextResponse.json({ received: true, duplicate: true }, { status: 200 })
  }

  if (eventType !== 'charge.success') {
    await markWebhookEvent(eventRow.eventRowId, 'IGNORED')
    logger.info('paystack.webhook_ignored', { eventId, eventType })
    return NextResponse.json({ received: true }, { status: 200 })
  }

  if (!reference) {
    await markWebhookEvent(
      eventRow.eventRowId,
      'FAILED',
      'charge.success event carried no reference',
    )
    logger.error('paystack.webhook_rejected', { reason: 'missing_reference', eventId })
    return NextResponse.json({ received: false }, { status: 400 })
  }

  const outcome = await settlePaystackPayment(reference)

  switch (outcome.outcome) {
    case 'extended':
    case 'duplicate':
      await markWebhookEvent(eventRow.eventRowId, 'PROCESSED')
      logger.info('paystack.webhook_processed', { eventId, reference, outcome: outcome.outcome })
      return NextResponse.json({ received: true }, { status: 200 })

    case 'rejected':
      // Paystack definitively adjudicated this as not-successful (or the
      // amount/currency didn't match) — retrying cannot change that outcome,
      // so acknowledge with 200 to stop Paystack's redelivery.
      await markWebhookEvent(eventRow.eventRowId, 'FAILED', outcome.reason)
      logger.warn('paystack.webhook_rejected', { eventId, reference, reason: outcome.reason })
      return NextResponse.json({ received: true }, { status: 200 })

    case 'unavailable':
      // Our own verify call to Paystack failed (network/5xx) — Paystack
      // never actually adjudicated this payment. Leave the row RECEIVED
      // (non-terminal, re-claimable) and return 500 so Paystack retries.
      logger.error('paystack.webhook_verify_unavailable', {
        eventId,
        reference,
        reason: outcome.reason,
      })
      return NextResponse.json({ received: false }, { status: 500 })
  }
}
