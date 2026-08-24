import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { fetchPermissionGrants } from '@/lib/auth/context'
import { resolvePermission } from '@/lib/auth/permissions'
import {
  generateInvitationToken,
  hashInvitationToken,
  invitationExpiry,
} from '@/lib/employees/invitations'
import { pool } from './helpers/db'
import { bootstrapOrganization, createAnonClient, createTestUser } from './helpers/supabase'

/**
 * Milestone 11's Acceptance Criteria: "An employee can be invited, accept the
 * invitation, and log in with the assigned role/scope." Plus the Testing
 * Requirements: "full invite -> accept -> login flow" and the negative space
 * around it (an invitation is single-use, time-limited, and bound to its
 * invited address).
 *
 * The invite is created through the real signed-in Owner client (exercising
 * employee_invitations_insert) and accepted through a real signed-up invitee
 * client calling accept_employee_invitation() directly — never through a
 * Server Action, for the same reason role-builder.test.ts and
 * deactivation.test.ts avoid the app layer: this proves the database itself
 * is the boundary.
 */

interface Fixture {
  organizationId: string
  owner: { client: SupabaseClient; userId: string }
  /** A single-permission custom role, so accepting actually changes what the invitee can do. */
  viewerRoleId: string
}

let fixture: Fixture

async function createInvitation(
  overrides: Partial<{
    email: string
    roleId: string
    expiresAt: Date
    ownerClient: SupabaseClient
  }> = {},
): Promise<{ rawToken: string; tokenHash: string; email: string; invitationId: string }> {
  const email = overrides.email ?? `invitee-${randomUUID()}@example.com`
  const rawToken = generateInvitationToken()
  const tokenHash = hashInvitationToken(rawToken)
  const client = overrides.ownerClient ?? fixture.owner.client

  const { data, error } = await client
    .from('employee_invitations')
    .insert({
      organization_id: fixture.organizationId,
      email,
      role_id: overrides.roleId ?? fixture.viewerRoleId,
      token_hash: tokenHash,
      expires_at: (overrides.expiresAt ?? invitationExpiry()).toISOString(),
      created_by: fixture.owner.userId,
    })
    .select('id')
    .single()

  if (error) throw error
  return { rawToken, tokenHash, email, invitationId: data!.id as string }
}

beforeAll(async () => {
  const suffix = randomUUID().slice(0, 8)
  const owner = await createTestUser()
  const { organizationId } = await bootstrapOrganization(owner, `Invites${suffix}`)

  const roleResult = await pool.query(
    `insert into public.roles (name, slug, is_system_role) values ($1, $2, false) returning id`,
    [`invitee-viewer-${suffix}`, `invitee-viewer-${suffix}`],
  )
  const permissionResult = await pool.query(
    `select id from public.permissions where key = 'branches.view'`,
  )
  await pool.query(`insert into public.role_permissions (role_id, permission_id) values ($1, $2)`, [
    roleResult.rows[0].id,
    permissionResult.rows[0].id,
  ])

  fixture = {
    organizationId,
    owner: { client: owner.client, userId: owner.userId },
    viewerRoleId: roleResult.rows[0].id as string,
  }
})

afterAll(async () => {
  await pool.end()
})

describe('employee invitations — full invite → accept → login flow', () => {
  it('an invited email, once accepted, holds exactly the invited role at the invited scope', async () => {
    const { rawToken, tokenHash, email } = await createInvitation()

    // The invitee's first contact is unauthenticated — get_employee_invitation
    // must work for them.
    const anon = createAnonClient()
    const { data: status, error: statusError } = await anon
      .rpc('get_employee_invitation', { p_token_hash: tokenHash })
      .single()
    expect(statusError).toBeNull()
    expect((status as { status: string }).status).toBe('pending')
    expect((status as { email: string }).email).toBe(email)

    // Invitee signs up as the exact invited address (mirrors
    // app/(auth)/invite/actions.ts's signUp-then-accept sequence).
    const invitee = createAnonClient()
    const { data: signUpData, error: signUpError } = await invitee.auth.signUp({
      email,
      password: `Test-${randomUUID()}`,
    })
    expect(signUpError).toBeNull()
    expect(signUpData.session).not.toBeNull()

    const { data: userRoleId, error: acceptError } = await invitee.rpc(
      'accept_employee_invitation',
      {
        p_token_hash: tokenHash,
      },
    )
    expect(acceptError).toBeNull()
    expect(userRoleId).toBeTruthy()

    const grants = await fetchPermissionGrants(invitee)
    const grantedInOrg = grants.filter((g) => g.organizationId === fixture.organizationId)
    expect(grantedInOrg).toHaveLength(1)
    expect(
      resolvePermission(grants, 'branches.view', { organizationId: fixture.organizationId }),
    ).toBe(true)

    // rawToken is asserted merely to exist and differ from the hash — this is
    // what the email/copy-link UI actually sends; the hash is what the
    // database ever sees.
    expect(rawToken).not.toBe(tokenHash)

    const { data: accepted } = await anon
      .rpc('get_employee_invitation', { p_token_hash: tokenHash })
      .single()
    expect((accepted as { status: string }).status).toBe('accepted')
  })

  it('rejects an expired invitation', async () => {
    const { tokenHash, email } = await createInvitation({
      expiresAt: new Date(Date.now() - 60_000),
    })

    const invitee = createAnonClient()
    await invitee.auth.signUp({ email, password: `Test-${randomUUID()}` })

    const { error } = await invitee.rpc('accept_employee_invitation', { p_token_hash: tokenHash })
    expect(error?.message).toContain('invitation_expired')
  })

  it('rejects a second acceptance of an already-accepted invitation (single-use)', async () => {
    const { tokenHash, email } = await createInvitation()

    const invitee = createAnonClient()
    await invitee.auth.signUp({ email, password: `Test-${randomUUID()}` })
    const { error: firstError } = await invitee.rpc('accept_employee_invitation', {
      p_token_hash: tokenHash,
    })
    expect(firstError).toBeNull()

    const { error: secondError } = await invitee.rpc('accept_employee_invitation', {
      p_token_hash: tokenHash,
    })
    expect(secondError?.message).toContain('invitation_already_accepted')
  })

  it('rejects acceptance by a signed-in user whose email does not match the invitation', async () => {
    const { tokenHash } = await createInvitation()

    // A DIFFERENT person, signed in under their own address, tries to redeem
    // someone else's invite link — the "forwarded email" / "shared screen" threat.
    const impostor = await createTestUser()
    const { error } = await impostor.client.rpc('accept_employee_invitation', {
      p_token_hash: tokenHash,
    })
    expect(error?.message).toContain('invitation_email_mismatch')
  })

  it('rejects a revoked invitation', async () => {
    const { tokenHash, email, invitationId } = await createInvitation()

    const { error: revokeError } = await fixture.owner.client
      .from('employee_invitations')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', invitationId)
    expect(revokeError).toBeNull()

    const invitee = createAnonClient()
    await invitee.auth.signUp({ email, password: `Test-${randomUUID()}` })
    const { error } = await invitee.rpc('accept_employee_invitation', { p_token_hash: tokenHash })
    expect(error?.message).toContain('invitation_revoked')
  })

  it('rejects an unknown token', async () => {
    const invitee = await createTestUser()
    const { error } = await invitee.client.rpc('accept_employee_invitation', {
      p_token_hash: hashInvitationToken(generateInvitationToken()),
    })
    expect(error?.message).toContain('invalid_invitation')
  })
})

describe('employee invitations — the escalation door is locked here too', () => {
  it('a user without employees.invite cannot create an invitation', async () => {
    const bystander = await createTestUser()
    const roleResult = await pool.query(`select id from public.roles where slug = 'cashier'`)
    await pool.query(
      `insert into public.user_roles (user_id, role_id, organization_id) values ($1, $2, $3)`,
      [bystander.userId, roleResult.rows[0].id, fixture.organizationId],
    )

    const rawToken = generateInvitationToken()
    const { error } = await bystander.client.from('employee_invitations').insert({
      organization_id: fixture.organizationId,
      email: `nope-${randomUUID()}@example.com`,
      role_id: fixture.viewerRoleId,
      token_hash: hashInvitationToken(rawToken),
      expires_at: invitationExpiry().toISOString(),
      created_by: bystander.userId,
    })
    expect(error).not.toBeNull()
  })

  it('a user with employees.invite cannot invite someone as a role richer than their own grants', async () => {
    // Holds employees.invite ONLY — no branches.view, so they cannot invite
    // as the viewerRoleId fixture (which grants branches.view).
    const inviterResult = await pool.query(
      `insert into public.roles (name, slug, is_system_role) values ($1, $2, false) returning id`,
      [`inviter-only-${randomUUID().slice(0, 8)}`, `inviter-only-${randomUUID().slice(0, 8)}`],
    )
    const permissionResult = await pool.query(
      `select id from public.permissions where key = 'employees.invite'`,
    )
    await pool.query(
      `insert into public.role_permissions (role_id, permission_id) values ($1, $2)`,
      [inviterResult.rows[0].id, permissionResult.rows[0].id],
    )
    const weakInviter = await createTestUser()
    await pool.query(
      `insert into public.user_roles (user_id, role_id, organization_id) values ($1, $2, $3)`,
      [weakInviter.userId, inviterResult.rows[0].id, fixture.organizationId],
    )

    const rawToken = generateInvitationToken()
    const { error } = await weakInviter.client.from('employee_invitations').insert({
      organization_id: fixture.organizationId,
      email: `puppet-${randomUUID()}@example.com`,
      role_id: fixture.viewerRoleId,
      token_hash: hashInvitationToken(rawToken),
      expires_at: invitationExpiry().toISOString(),
      created_by: weakInviter.userId,
    })
    expect(error).not.toBeNull()
  })
})
