import { describe, expect, it } from 'vitest'

import { createAnonClient, createTestUser } from './helpers/supabase'

/**
 * Milestone 17 Part C, the half that cannot be proved in the browser: a
 * password change has to revoke OTHER devices' refresh tokens server-side, not
 * merely clear a cookie. A stolen token sitting on somebody else's machine has
 * to stop working.
 *
 * These drive supabase-js directly rather than the Server Actions in
 * app/(auth)/actions.ts — those call redirect() and cookies() from
 * next/headers, neither of which exists outside a request. What is under test
 * here is the `scope` semantics the actions depend on, against the real GoTrue
 * running in the local stack, which is the part that would break silently on a
 * Supabase upgrade.
 */

/** Signs the same user in again, as a second device would. */
async function signInAsSecondDevice(email: string, password: string) {
  const client = createAnonClient()
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}

describe('password change revokes other sessions', () => {
  it("signOut({ scope: 'others' }) kills the other device but keeps the caller signed in", async () => {
    const owner = await createTestUser()
    const otherDevice = await signInAsSecondDevice(owner.email, owner.password)

    // Both sessions are live to begin with.
    expect((await owner.client.auth.getUser()).data.user?.id).toBe(owner.userId)
    expect((await otherDevice.auth.getUser()).data.user?.id).toBe(owner.userId)

    // What confirmPasswordReset() and changePassword() do after updateUser().
    const newPassword = `${owner.password}-rotated`
    const { error: updateError } = await owner.client.auth.updateUser({ password: newPassword })
    expect(updateError).toBeNull()

    const { error: revokeError } = await owner.client.auth.signOut({ scope: 'others' })
    expect(revokeError).toBeNull()

    // The caller keeps working — they are standing in front of this one.
    expect((await owner.client.auth.getUser()).data.user?.id).toBe(owner.userId)

    // The other device's refresh token is dead server-side. Its cached access
    // token may still parse locally until it expires, so the assertion is that
    // it can no longer be exchanged for a new one — which is what a real
    // device does on its next request.
    const { error: refreshError } = await otherDevice.auth.refreshSession()
    expect(refreshError).not.toBeNull()
  })

  it('the old password stops working after the change', async () => {
    const owner = await createTestUser()
    const newPassword = `${owner.password}-rotated`

    const { error: updateError } = await owner.client.auth.updateUser({ password: newPassword })
    expect(updateError).toBeNull()

    const stale = createAnonClient()
    const { error: staleError } = await stale.auth.signInWithPassword({
      email: owner.email,
      password: owner.password,
    })
    expect(staleError).not.toBeNull()

    const fresh = createAnonClient()
    const { error: freshError } = await fresh.auth.signInWithPassword({
      email: owner.email,
      password: newPassword,
    })
    expect(freshError).toBeNull()
  })

  it("signOut({ scope: 'global' }) ends the caller's own session too", async () => {
    const owner = await createTestUser()

    const { error } = await owner.client.auth.signOut({ scope: 'global' })
    expect(error).toBeNull()

    expect((await owner.client.auth.getUser()).data.user).toBeNull()
  })
})
