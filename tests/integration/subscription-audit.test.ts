import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { pool } from './helpers/db'
import { bootstrapOrganization, createTestUser, setSubscriptionPeriodEnd } from './helpers/supabase'

// See tests/integration/subscription-webhook.test.ts's identical mock for
// why: driving a Route Handler's exported POST directly, outside Next's own
// server, has no AsyncLocalStorage request scope for next/headers to read.
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
}))

/**
 * Milestone 13's Acceptance Criteria: "All subscription/payment events are
 * audited." One assertion per action named in Database/Observability.
 */

afterAll(async () => {
  await pool.end()
})

async function hasAuditRow(organizationId: string | null, action: string): Promise<boolean> {
  const result = await pool.query(
    organizationId
      ? `select 1 from public.audit_logs where action = $1 and organization_id = $2`
      : `select 1 from public.audit_logs where action = $1`,
    organizationId ? [action, organizationId] : [action],
  )
  return result.rows.length > 0
}

describe('subscription audit coverage', () => {
  it('pricing_updated is audited', async () => {
    const suffix = randomUUID().slice(0, 8)
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, `AuditPricing${suffix}`)

    // Grant platform.manage_pricing via a fixture role, not Owner (who never
    // holds it by design — see seed.sql §6's platform.* exclusion).
    const roleResult = await pool.query(
      `insert into public.roles (name, slug, is_system_role, organization_id) values ($1, $2, false, $3) returning id`,
      [`audit-admin-${suffix}`, `audit-admin-${suffix}`, organizationId],
    )
    const permResult = await pool.query(
      `select id from public.permissions where key = 'platform.manage_pricing'`,
    )
    await pool.query(
      `insert into public.role_permissions (role_id, permission_id) values ($1, $2)`,
      [roleResult.rows[0].id, permResult.rows[0].id],
    )
    const admin = await createTestUser()
    await pool.query(
      `insert into public.user_roles (user_id, role_id, organization_id) values ($1, $2, $3)`,
      [admin.userId, roleResult.rows[0].id, organizationId],
    )

    const { error } = await admin.client.rpc('set_subscription_price', {
      p_billing_period: 'MONTHLY',
      p_price_minor: 750000,
      p_currency: 'NGN',
    })
    expect(error).toBeNull()
    expect(await hasAuditRow(organizationId, 'subscription.pricing_updated')).toBe(true)
  })

  it('checkout_initiated is audited', async () => {
    const suffix = randomUUID().slice(0, 8)
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, `AuditCheckout${suffix}`)

    const { error } = await owner.client.rpc('initiate_subscription_payment', {
      p_organization_id: organizationId,
      p_billing_period: 'MONTHLY',
      p_reference: `audit_${randomUUID()}`,
    })
    expect(error).toBeNull()
    expect(await hasAuditRow(organizationId, 'subscription.checkout_initiated')).toBe(true)
  })

  it('payment_verified and renewed are audited on a successful settlement', async () => {
    const suffix = randomUUID().slice(0, 8)
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, `AuditRenew${suffix}`)
    const reference = `audit_${randomUUID()}`

    const { error: initError } = await owner.client.rpc('initiate_subscription_payment', {
      p_organization_id: organizationId,
      p_billing_period: 'MONTHLY',
      p_reference: reference,
    })
    expect(initError).toBeNull()

    // apply_subscription_payment is service_role-only — called here via a
    // direct superuser connection, standing in for the service-role client
    // lib/subscription/settlement.ts actually uses.
    await pool.query(`select public.apply_subscription_payment($1, $2, $3, $4, $5)`, [
      reference,
      123456,
      500000,
      'NGN',
      '{}',
    ])

    expect(await hasAuditRow(organizationId, 'subscription.payment_verified')).toBe(true)
    expect(await hasAuditRow(organizationId, 'subscription.renewed')).toBe(true)
  })

  it('payment_verification_failed is audited', async () => {
    const suffix = randomUUID().slice(0, 8)
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, `AuditFail${suffix}`)
    const reference = `audit_${randomUUID()}`

    await owner.client.rpc('initiate_subscription_payment', {
      p_organization_id: organizationId,
      p_billing_period: 'MONTHLY',
      p_reference: reference,
    })

    await pool.query(`select public.fail_subscription_payment($1, $2)`, [
      reference,
      'amount mismatch',
    ])
    expect(await hasAuditRow(organizationId, 'subscription.payment_verification_failed')).toBe(true)
  })

  it('subscription.expired is audited by the daily sweep', async () => {
    const suffix = randomUUID().slice(0, 8)
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, `AuditExpire${suffix}`)
    await setSubscriptionPeriodEnd(organizationId, new Date(Date.now() - 1000))

    await pool.query(`select * from public.run_subscription_daily_sweep()`)
    expect(await hasAuditRow(organizationId, 'subscription.expired')).toBe(true)
  })

  it('webhook_rejected is audited on a bad-signature request (no organization context)', async () => {
    // organization_id is null for this action (auth_logs' Milestone 03
    // schema permits it — see 20260822091300_create_audit_logs.sql) since a
    // rejected webhook has no verified identity to attribute it to.
    const before = await pool.query(
      `select count(*) from public.audit_logs where action = 'subscription.webhook_rejected'`,
    )

    const { NextRequest } = await import('next/server')
    const { POST } = await import('@/app/api/webhooks/paystack/route')
    await POST(
      new NextRequest('http://localhost/api/webhooks/paystack', {
        method: 'POST',
        body: JSON.stringify({ event: 'charge.success', data: { reference: 'irrelevant' } }),
        headers: { 'x-paystack-signature': 'not-a-real-signature' },
      }),
    )

    const after = await pool.query(
      `select count(*) from public.audit_logs where action = 'subscription.webhook_rejected'`,
    )
    expect(Number(after.rows[0].count)).toBeGreaterThan(Number(before.rows[0].count))
  })
})
