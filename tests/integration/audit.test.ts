import { afterAll, describe, expect, it } from 'vitest'

import { pool, withTransaction } from './helpers/db'
import { bootstrapOrganization, createAnonClient, createTestUser } from './helpers/supabase'

describe('audit log — write path and append-only enforcement', () => {
  afterAll(async () => {
    await pool.end()
  })

  it('record_audit_event() is the only insert path and is reachable pre-session (anon)', async () => {
    const anon = createAnonClient()
    const { data, error } = await anon.rpc('record_audit_event', {
      p_organization_id: null,
      p_user_id: null,
      p_action: 'auth.sign_in_failed',
      p_resource_type: 'user',
      p_metadata: { identifier: 'nobody@example.com' },
    })
    expect(error).toBeNull()
    expect(data).toBeTruthy()

    const result = await pool.query('select action from public.audit_logs where id = $1', [data])
    expect(result.rows[0]?.action).toBe('auth.sign_in_failed')
  })

  it('bootstrapping an organization records organization.created and user_role.assigned', async () => {
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, 'Audit Test Org')

    const result = await pool.query(
      `select action from public.audit_logs where organization_id = $1 order by created_at`,
      [organizationId],
    )
    expect(result.rows.map((row) => row.action)).toEqual(
      expect.arrayContaining(['organization.created', 'user_role.assigned']),
    )
  })

  it('an authenticated user cannot UPDATE audit_logs (no application role has that grant)', async () => {
    await withTransaction(async (client) => {
      const insert = await client.query(
        `insert into public.audit_logs (action, resource_type) values ('test.action', 'test') returning id`,
      )

      await client.query('SET LOCAL ROLE authenticated')
      await expect(
        client.query('update public.audit_logs set action = $1 where id = $2', [
          'tampered',
          insert.rows[0].id,
        ]),
      ).rejects.toMatchObject({ code: '42501' }) // insufficient_privilege
    })
  })

  it('an authenticated user cannot DELETE audit_logs (no application role has that grant)', async () => {
    await withTransaction(async (client) => {
      const insert = await client.query(
        `insert into public.audit_logs (action, resource_type) values ('test.action', 'test') returning id`,
      )

      await client.query('SET LOCAL ROLE authenticated')
      await expect(
        client.query('delete from public.audit_logs where id = $1', [insert.rows[0].id]),
      ).rejects.toMatchObject({ code: '42501' })
    })
  })

  it('an authenticated user cannot INSERT into audit_logs directly (bypassing the RPC)', async () => {
    await withTransaction(async (client) => {
      await client.query('SET LOCAL ROLE authenticated')
      await expect(
        client.query(
          `insert into public.audit_logs (action, resource_type) values ('forged', 'test')`,
        ),
      ).rejects.toMatchObject({ code: '42501' })
    })
  })
})
