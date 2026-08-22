import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'

import { createAnonClient, createTestUser } from './helpers/supabase'

describe('login throttling', () => {
  it('is not throttled below the failure threshold', async () => {
    const identifier = `throttle-${randomUUID()}@example.com`
    const client = createAnonClient()

    for (let i = 0; i < 4; i++) {
      await client.rpc('record_login_attempt', {
        p_identifier: identifier,
        p_ip_address: null,
        p_succeeded: false,
      })
    }

    const { data, error } = await client.rpc('check_login_throttle', { p_identifier: identifier })
    expect(error).toBeNull()
    expect(data).toBe(false)
  })

  it('throttles after 5 failed attempts within the window', async () => {
    const identifier = `throttle-${randomUUID()}@example.com`
    const client = createAnonClient()

    for (let i = 0; i < 5; i++) {
      await client.rpc('record_login_attempt', {
        p_identifier: identifier,
        p_ip_address: null,
        p_succeeded: false,
      })
    }

    const { data, error } = await client.rpc('check_login_throttle', { p_identifier: identifier })
    expect(error).toBeNull()
    expect(data).toBe(true)
  })

  it('is case-insensitive on the identifier (email)', async () => {
    const base = `Throttle-${randomUUID()}`
    const client = createAnonClient()

    for (let i = 0; i < 5; i++) {
      await client.rpc('record_login_attempt', {
        p_identifier: `${base}@Example.com`,
        p_ip_address: null,
        p_succeeded: false,
      })
    }

    const { data } = await client.rpc('check_login_throttle', {
      p_identifier: `${base.toLowerCase()}@example.com`,
    })
    expect(data).toBe(true)
  })

  it('a real repeated-wrong-password sign-in is throttled after the threshold', async () => {
    const user = await createTestUser()
    const client = createAnonClient()

    for (let i = 0; i < 5; i++) {
      await client.auth.signInWithPassword({ email: user.email, password: 'wrong-password' })
      await client.rpc('record_login_attempt', {
        p_identifier: user.email.toLowerCase(),
        p_ip_address: null,
        p_succeeded: false,
      })
    }

    const { data } = await client.rpc('check_login_throttle', {
      p_identifier: user.email.toLowerCase(),
    })
    expect(data).toBe(true)
  })
})
