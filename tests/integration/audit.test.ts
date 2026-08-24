import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'

import { generateInvitationToken, hashInvitationToken, invitationExpiry } from '@/lib/employees/invitations'
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

  /**
   * Milestone 11's Security Requirements: "every employee/role/branding/
   * receipt-template change is audited."
   *
   * Scope note: this file's existing tests (above) exercise
   * record_audit_event()'s guarantees at the SQL layer — the only insert
   * path, append-only, reachable pre-session — and that layer is exactly
   * where every Milestone 11 action backed by a SECURITY DEFINER function
   * (set_employee_active(), accept_employee_invitation()) actually calls it,
   * so those are tested directly below via RPC, the same way
   * 'bootstrapping an organization records...' above tests
   * create_organization_with_owner().
   *
   * Actions audited instead from lib/{roles,employees,branding,receipts}/
   * mutations.ts (role.created, role.permissions_updated,
   * employee_invitation.created, organization.branding_updated,
   * organization.logo_updated, organization.receipt_settings_updated) call
   * the identical recordAuditEvent() -> record_audit_event() path, but from
   * inside a Server Action that needs next/headers — unreachable from this
   * `pg`/anon-client integration harness, the same reason no existing test
   * in this codebase calls into a lib/<domain>/mutations.ts function directly.
   * Their audit coverage is the shared shape every mutation module here
   * follows (requirePermission() -> mutate -> recordAuditEvent(), enforced
   * by code review and this file's proof that the RPC they all funnel
   * through is itself correct), not a second, redundant per-action test.
   */
  describe('Milestone 11 — SQL-layer administration actions are audited', () => {
    async function auditActionsFor(organizationId: string, resourceType: string): Promise<string[]> {
      const result = await pool.query(
        `select action from public.audit_logs where organization_id = $1 and resource_type = $2 order by created_at`,
        [organizationId, resourceType],
      )
      return result.rows.map((row) => row.action)
    }

    it('employee_invitation.accepted and user_role.assigned (via accept_employee_invitation)', async () => {
      const owner = await createTestUser()
      const suffix = randomUUID().slice(0, 8)
      const { organizationId } = await bootstrapOrganization(owner, `AuditInvite${suffix}`)

      const roleResult = await pool.query(`select id from public.roles where slug = 'cashier'`)
      const email = `audit-invitee-${suffix}@example.com`
      const rawToken = generateInvitationToken()

      await owner.client.from('employee_invitations').insert({
        organization_id: organizationId,
        email,
        role_id: roleResult.rows[0].id,
        token_hash: hashInvitationToken(rawToken),
        expires_at: invitationExpiry().toISOString(),
        created_by: owner.userId,
      })

      const invitee = createAnonClient()
      await invitee.auth.signUp({ email, password: `Test-${randomUUID()}` })
      await invitee.rpc('accept_employee_invitation', { p_token_hash: hashInvitationToken(rawToken) })

      const actions = await auditActionsFor(organizationId, 'employee_invitation')
      expect(actions).toEqual(expect.arrayContaining(['employee_invitation.accepted']))

      const userRoleActions = await auditActionsFor(organizationId, 'user_role')
      expect(userRoleActions).toEqual(expect.arrayContaining(['user_role.assigned']))
    })

    it('employee.deactivated and employee.reactivated', async () => {
      const owner = await createTestUser()
      const { organizationId } = await bootstrapOrganization(owner, `AuditDeactivate${randomUUID().slice(0, 8)}`)

      const employee = await createTestUser()
      const roleResult = await pool.query(`select id from public.roles where slug = 'cashier'`)
      await pool.query(
        `insert into public.user_roles (user_id, role_id, organization_id) values ($1, $2, $3)`,
        [employee.userId, roleResult.rows[0].id, organizationId],
      )

      await owner.client.rpc('set_employee_active', {
        p_user_id: employee.userId,
        p_organization_id: organizationId,
        p_active: false,
      })
      await owner.client.rpc('set_employee_active', {
        p_user_id: employee.userId,
        p_organization_id: organizationId,
        p_active: true,
      })

      const actions = await auditActionsFor(organizationId, 'user')
      expect(actions).toEqual(
        expect.arrayContaining(['employee.deactivated', 'employee.reactivated']),
      )
    })
  })
})
