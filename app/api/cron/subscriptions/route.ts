import { timingSafeEqual } from 'node:crypto'

import { NextResponse, type NextRequest } from 'next/server'

import { logger } from '@/lib/logger'
import { runSubscriptionSweep } from '@/lib/subscription/sweep'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * The daily scheduled job (docs/milestones/13-subscription-billing-and-platform-admin.md
 * CI/CD Requirements: "a scheduled ... job that evaluates approaching/passed
 * expiry dates daily"). Wired via vercel.json's `crons` entry — Vercel
 * issues a GET request and automatically attaches
 * `Authorization: Bearer $CRON_SECRET` when that env var is set on the
 * project, so no extra configuration is needed beyond the variable itself.
 *
 * FAILS CLOSED: an unset CRON_SECRET returns 503 (never runs
 * unauthenticated) rather than 401, distinguishing "misconfigured" from
 * "someone guessed wrong" in the logs.
 */
export async function GET(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET

  if (!expectedSecret) {
    logger.error('subscription.cron_misconfigured', { reason: 'CRON_SECRET is not set' })
    return NextResponse.json({ ok: false }, { status: 503 })
  }

  const header = request.headers.get('authorization') ?? ''
  const expected = Buffer.from(`Bearer ${expectedSecret}`, 'utf8')
  const actual = Buffer.from(header, 'utf8')
  const authorized = expected.length === actual.length && timingSafeEqual(expected, actual)

  if (!authorized) {
    logger.warn('subscription.cron_unauthorized')
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  try {
    const result = await runSubscriptionSweep()
    logger.info('subscription.cron_completed', { ...result })
    return NextResponse.json({ ok: true, ...result }, { status: 200 })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    logger.error('subscription.cron_failed', { reason })
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
