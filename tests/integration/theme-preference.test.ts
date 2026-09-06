import { afterAll, describe, expect, it } from 'vitest'

import { pool } from './helpers/db'
import { createTestUser } from './helpers/supabase'

/**
 * set_theme_preference() (20260908090500) — the write path behind the
 * admin-shell Light/Dark/System control. Only ever touches the caller's own
 * users row and only theme_preference; 'system' is stored as NULL.
 */

afterAll(async () => {
  await pool.end()
})

async function storedPreference(userId: string): Promise<string | null> {
  const { rows } = await pool.query<{ theme_preference: string | null }>(
    `select theme_preference from public.users where id = $1`,
    [userId],
  )
  return rows[0]?.theme_preference ?? null
}

describe('set_theme_preference', () => {
  it('stores light/dark, and normalises system to NULL', async () => {
    const user = await createTestUser()

    expect((await user.client.rpc('set_theme_preference', { p_value: 'dark' })).error).toBeNull()
    expect(await storedPreference(user.userId)).toBe('dark')

    expect((await user.client.rpc('set_theme_preference', { p_value: 'light' })).error).toBeNull()
    expect(await storedPreference(user.userId)).toBe('light')

    expect((await user.client.rpc('set_theme_preference', { p_value: 'system' })).error).toBeNull()
    expect(await storedPreference(user.userId)).toBeNull()
  })

  it('rejects an unknown value', async () => {
    const user = await createTestUser()
    const { error } = await user.client.rpc('set_theme_preference', { p_value: 'sepia' })
    expect(error).not.toBeNull()
    expect(await storedPreference(user.userId)).toBeNull()
  })

  it('only ever writes the caller’s own row', async () => {
    const a = await createTestUser()
    const b = await createTestUser()

    await a.client.rpc('set_theme_preference', { p_value: 'dark' })
    await b.client.rpc('set_theme_preference', { p_value: 'light' })

    expect(await storedPreference(a.userId)).toBe('dark')
    expect(await storedPreference(b.userId)).toBe('light')
  })
})
