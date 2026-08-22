import { afterAll, describe, expect, it } from 'vitest'

import { pool } from './helpers/db'
import {
  bootstrapOrganization,
  createAnonClient,
  createServiceRoleClient,
  createTestUser,
} from './helpers/supabase'

describe('sign-up / sign-in / sign-out / password reset', () => {
  afterAll(async () => {
    await pool.end()
  })

  it('sign-up creates a matching public.users row (auth.users trigger)', async () => {
    const user = await createTestUser()
    const result = await pool.query('select email from public.users where id = $1', [user.userId])
    expect(result.rows[0]?.email).toBe(user.email)
  })

  it('bootstraps an Organization + Owner role assignment on first signup', async () => {
    const user = await createTestUser()
    const { organizationId } = await bootstrapOrganization(user, 'Auth Test Org')

    const result = await pool.query(
      `select r.slug from public.user_roles ur
       join public.roles r on r.id = ur.role_id
       where ur.user_id = $1 and ur.organization_id = $2`,
      [user.userId, organizationId],
    )
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].slug).toBe('owner')
  })

  it('rejects a second bootstrap for a user who already belongs to an organization', async () => {
    const user = await createTestUser()
    await bootstrapOrganization(user, 'First Org')

    await expect(bootstrapOrganization(user, 'Second Org')).rejects.toThrow()
  })

  it('signs in with the correct password and signs out cleanly', async () => {
    const user = await createTestUser()
    await user.client.auth.signOut()

    const signInClient = createAnonClient()
    const { data, error } = await signInClient.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    })
    expect(error).toBeNull()
    expect(data.session).not.toBeNull()

    const { error: signOutError } = await signInClient.auth.signOut()
    expect(signOutError).toBeNull()

    const { data: afterSignOut } = await signInClient.auth.getUser()
    expect(afterSignOut.user).toBeNull()
  })

  it('rejects sign-in with the wrong password', async () => {
    const user = await createTestUser()
    const signInClient = createAnonClient()
    const { error } = await signInClient.auth.signInWithPassword({
      email: user.email,
      password: 'definitely-wrong-password',
    })
    expect(error).not.toBeNull()
  })

  it('a password-recovery link lets the user set a new password', async () => {
    const user = await createTestUser()
    const admin = createServiceRoleClient()

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: user.email,
    })
    expect(linkError).toBeNull()

    const tokenHash = linkData.properties?.hashed_token
    expect(tokenHash).toBeTruthy()

    const recoveryClient = createAnonClient()
    const { error: verifyError } = await recoveryClient.auth.verifyOtp({
      type: 'recovery',
      token_hash: tokenHash!,
    })
    expect(verifyError).toBeNull()

    const newPassword = 'a-brand-new-password-123'
    const { error: updateError } = await recoveryClient.auth.updateUser({ password: newPassword })
    expect(updateError).toBeNull()

    const freshClient = createAnonClient()
    const { error: signInError } = await freshClient.auth.signInWithPassword({
      email: user.email,
      password: newPassword,
    })
    expect(signInError).toBeNull()
  })
})
