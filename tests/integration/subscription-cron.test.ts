import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'

import { pool } from './helpers/db'
import { bootstrapOrganization, createTestUser, setSubscriptionPeriodEnd } from './helpers/supabase'

/**
 * app/api/cron/subscriptions/route.ts's auth gate, and
 * run_subscription_daily_sweep()'s (20260825100700) status transitions +
 * notification fan-out + retention sweep — the milestone's CI/CD
 * Requirement ("a scheduled ... job that evaluates approaching/passed
 * expiry dates daily") and Testing Requirement ("the 7-day expiry warning
 * triggers correctly").
 */

const CRON_SECRET = 'test-cron-secret'
process.env.CRON_SECRET = CRON_SECRET

function cronRequest(authorization?: string) {
  return new NextRequest('http://localhost/api/cron/subscriptions', {
    method: 'GET',
    headers: authorization ? { authorization } : {},
  })
}

afterAll(async () => {
  await pool.end()
})

describe('GET /api/cron/subscriptions — auth gate', () => {
  it('401s without a bearer token', async () => {
    const { GET } = await import('@/app/api/cron/subscriptions/route')
    const response = await GET(cronRequest())
    expect(response.status).toBe(401)
  })

  it('401s with the wrong bearer token', async () => {
    const { GET } = await import('@/app/api/cron/subscriptions/route')
    const response = await GET(cronRequest('Bearer wrong-secret'))
    expect(response.status).toBe(401)
  })

  it('200s with the correct bearer token', async () => {
    const { GET } = await import('@/app/api/cron/subscriptions/route')
    const response = await GET(cronRequest(`Bearer ${CRON_SECRET}`))
    expect(response.status).toBe(200)
  })

  it('503s when CRON_SECRET is unset — fails closed, never runs unauthenticated', async () => {
    const original = process.env.CRON_SECRET
    delete process.env.CRON_SECRET
    try {
      const { GET } = await import('@/app/api/cron/subscriptions/route')
      const response = await GET(cronRequest(`Bearer ${CRON_SECRET}`))
      expect(response.status).toBe(503)
    } finally {
      process.env.CRON_SECRET = original
    }
  })
})

describe('runSubscriptionSweep() — status transitions and notifications', () => {
  it('marks a subscription EXPIRING at 7 days out, EXPIRED once past, and does not touch one with 30 days left', async () => {
    const suffix = randomUUID().slice(0, 8)

    const expiringOwner = await createTestUser()
    const { organizationId: expiringOrgId } = await bootstrapOrganization(
      expiringOwner,
      `CronExpiring${suffix}`,
    )
    await setSubscriptionPeriodEnd(expiringOrgId, new Date(Date.now() + 5 * 24 * 60 * 60 * 1000))

    const expiredOwner = await createTestUser()
    const { organizationId: expiredOrgId } = await bootstrapOrganization(
      expiredOwner,
      `CronExpired${suffix}`,
    )
    await setSubscriptionPeriodEnd(expiredOrgId, new Date(Date.now() - 60 * 60 * 1000))

    const healthyOwner = await createTestUser()
    const { organizationId: healthyOrgId } = await bootstrapOrganization(
      healthyOwner,
      `CronHealthy${suffix}`,
    )

    // Drives the real application entry point (not the raw SQL function
    // directly) so this also exercises the email fan-out —
    // run_subscription_daily_sweep() only returns affected org ids;
    // runSubscriptionSweep() is what turns those into notify_*() calls.
    const { runSubscriptionSweep } = await import('@/lib/subscription/sweep')
    const result = await runSubscriptionSweep()
    expect(result.expiringMarked).toBeGreaterThanOrEqual(1)
    expect(result.expiredMarked).toBeGreaterThanOrEqual(1)
    expect(result.notificationsCreated).toBeGreaterThanOrEqual(2)
    // No RESEND_API_KEY locally -> the log transport "delivers" successfully
    // in-process, so this also proves the email path was actually reached.
    expect(result.emailsSent).toBeGreaterThanOrEqual(2)

    const statuses = await pool.query(
      `select organization_id, status from public.subscriptions where organization_id = any($1)`,
      [[expiringOrgId, expiredOrgId, healthyOrgId]],
    )
    const byOrg = Object.fromEntries(statuses.rows.map((r) => [r.organization_id, r.status]))
    expect(byOrg[expiringOrgId]).toBe('EXPIRING')
    expect(byOrg[expiredOrgId]).toBe('EXPIRED')
    expect(byOrg[healthyOrgId]).toBe('ACTIVE')

    // Billing notifications actually landed in each Owner's inbox.
    const notifs = await pool.query(
      `select organization_id, type from public.notifications where organization_id = any($1) and category = 'billing'`,
      [[expiringOrgId, expiredOrgId]],
    )
    const types = notifs.rows.map((r) => r.type)
    expect(types).toContain('subscription.expiring')
    expect(types).toContain('subscription.expired')
  })

  it('a second run on the same day does not create duplicate notifications', async () => {
    const suffix = randomUUID().slice(0, 8)
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, `CronDupe${suffix}`)
    await setSubscriptionPeriodEnd(organizationId, new Date(Date.now() + 3 * 24 * 60 * 60 * 1000))

    const { runSubscriptionSweep } = await import('@/lib/subscription/sweep')
    await runSubscriptionSweep()
    const firstCount = await pool.query(
      `select count(*) from public.notifications where organization_id = $1 and type = 'subscription.expiring'`,
      [organizationId],
    )

    await runSubscriptionSweep()
    const secondCount = await pool.query(
      `select count(*) from public.notifications where organization_id = $1 and type = 'subscription.expiring'`,
      [organizationId],
    )

    expect(secondCount.rows[0].count).toBe(firstCount.rows[0].count)
  })

  it('the retention sweep deletes read notifications older than 90 days and leaves unread/recent ones', async () => {
    const suffix = randomUUID().slice(0, 8)
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, `Retention${suffix}`)

    // Old + read: eligible for the sweep.
    await pool.query(
      `insert into public.notifications
         (user_id, organization_id, category, type, title, message, read_at, created_at)
       values ($1, $2, 'billing', 'subscription.renewed', 'old', 'old', now() - interval '95 days', now() - interval '95 days')`,
      [owner.userId, organizationId],
    )
    // Old but UNREAD: must survive.
    await pool.query(
      `insert into public.notifications
         (user_id, organization_id, category, type, title, message, created_at)
       values ($1, $2, 'billing', 'subscription.renewed', 'old-unread', 'old-unread', now() - interval '95 days')`,
      [owner.userId, organizationId],
    )
    // Recent and read: must survive.
    await pool.query(
      `insert into public.notifications
         (user_id, organization_id, category, type, title, message, read_at, created_at)
       values ($1, $2, 'billing', 'subscription.renewed', 'recent', 'recent', now(), now())`,
      [owner.userId, organizationId],
    )

    const { runSubscriptionSweep } = await import('@/lib/subscription/sweep')
    const result = await runSubscriptionSweep()
    expect(result.notificationsPurged).toBeGreaterThanOrEqual(1)

    const remaining = await pool.query(
      `select title from public.notifications where organization_id = $1 order by title`,
      [organizationId],
    )
    const titles = remaining.rows.map((r) => r.title)
    expect(titles).not.toContain('old')
    expect(titles).toContain('old-unread')
    expect(titles).toContain('recent')
  })
})
