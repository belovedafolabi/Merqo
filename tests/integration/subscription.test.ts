import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'

import { pool } from './helpers/db'
import { bootstrapOrganization, createTestUser } from './helpers/supabase'

/**
 * Schema/constraint coverage for the four Milestone 13 tables, plus
 * pricing-config authorization. Uses withTransaction-free raw pool queries
 * for constraint checks (matching tests/integration/constraints.test.ts's
 * style) and real supabase-js clients for the RPC authorization checks.
 */

afterAll(async () => {
  await pool.end()
})

describe('subscriptions — schema constraints', () => {
  it('organization_id is unique — a second row for the same organization is rejected', async () => {
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(
      owner,
      `Constraint${randomUUID().slice(0, 8)}`,
    )

    await expect(
      pool.query(
        `insert into public.subscriptions
           (organization_id, billing_period, price_minor, current_period_start, current_period_end, status)
         values ($1, 'MONTHLY', 0, now(), now() + interval '1 day', 'ACTIVE')`,
        [organizationId],
      ),
    ).rejects.toMatchObject({ code: '23505' })
  })

  it('current_period_end must be after current_period_start', async () => {
    await expect(
      pool.query(
        `insert into public.subscriptions
           (organization_id, billing_period, price_minor, current_period_start, current_period_end, status)
         values (gen_random_uuid(), 'MONTHLY', 0, now(), now() - interval '1 day', 'ACTIVE')`,
      ),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('billing_period is constrained to the four seeded durations', async () => {
    await expect(
      pool.query(
        `insert into public.subscriptions
           (organization_id, billing_period, price_minor, current_period_start, current_period_end, status)
         values (gen_random_uuid(), 'WEEKLY', 0, now(), now() + interval '1 day', 'ACTIVE')`,
      ),
    ).rejects.toMatchObject({ code: '23514' })
  })
})

describe('subscription_payments — idempotency shape', () => {
  it('paystack_reference is unique', async () => {
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(
      owner,
      `PayConstraint${randomUUID().slice(0, 8)}`,
    )
    const subResult = await pool.query(
      `select id from public.subscriptions where organization_id = $1`,
      [organizationId],
    )
    const subscriptionId = subResult.rows[0].id

    const reference = `test_${randomUUID()}`
    await pool.query(
      `insert into public.subscription_payments
         (organization_id, subscription_id, paystack_reference, billing_period, amount_minor)
       values ($1, $2, $3, 'MONTHLY', 500000)`,
      [organizationId, subscriptionId, reference],
    )

    await expect(
      pool.query(
        `insert into public.subscription_payments
           (organization_id, subscription_id, paystack_reference, billing_period, amount_minor)
         values ($1, $2, $3, 'MONTHLY', 500000)`,
        [organizationId, subscriptionId, reference],
      ),
    ).rejects.toMatchObject({ code: '23505' })
  })
})

describe('webhook_events — idempotency shape', () => {
  it('(provider, event_id) is unique', async () => {
    const eventId = `charge.success:${randomUUID()}`
    await pool.query(
      `insert into public.webhook_events (provider, event_id, event_type, payload)
       values ('paystack', $1, 'charge.success', '{}'::jsonb)`,
      [eventId],
    )

    await expect(
      pool.query(
        `insert into public.webhook_events (provider, event_id, event_type, payload)
         values ('paystack', $1, 'charge.success', '{}'::jsonb)`,
        [eventId],
      ),
    ).rejects.toMatchObject({ code: '23505' })
  })
})

describe('set_subscription_price — authorization', () => {
  it('an Owner (no platform.manage_pricing) is rejected', async () => {
    const owner = await createTestUser()
    await bootstrapOrganization(owner, `PricingAuthz${randomUUID().slice(0, 8)}`)

    const { error } = await owner.client.rpc('set_subscription_price', {
      p_billing_period: 'MONTHLY',
      p_price_minor: 100000,
      p_currency: 'NGN',
    })
    expect(error).not.toBeNull()
  })

  it('get_subscription_pricing() is readable by any authenticated user', async () => {
    const owner = await createTestUser()
    await bootstrapOrganization(owner, `PricingRead${randomUUID().slice(0, 8)}`)

    const { data, error } = await owner.client.rpc('get_subscription_pricing')
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    expect((data as unknown[]).length).toBe(4)
  })
})
