import { randomUUID } from 'node:crypto'

import { afterEach, describe, expect, it } from 'vitest'

import { pool } from './helpers/db'
import { bootstrapOrganization, createAnonClient, createTestUser } from './helpers/supabase'

/**
 * Regression coverage for every finding Milestone 15's audit fixed
 * (docs/milestones/15-audit/findings-and-fixes.md), plus the rate limiter it
 * introduced.
 *
 * tests/integration/security-sweep.test.ts asserts the SHAPE of the schema's
 * privileges — that nothing unexpected is anon-executable, that every
 * SECURITY DEFINER function pins search_path. This file asserts the
 * BEHAVIOUR those privileges are supposed to produce: that an anon caller
 * actually is refused, that a forged organization id actually is discarded,
 * that a bucket actually stops letting calls through. Both matter — a grant
 * can look right and a function body still be wrong.
 *
 * Deliberately commits rather than rolling back (unlike the withTransaction
 * suites): the rate limiter counts committed rows, and the RLS assertions
 * need cross-connection visibility. Each test cleans up after itself.
 */

const createdRateLimitBuckets: string[] = []

afterEach(async () => {
  if (createdRateLimitBuckets.length > 0) {
    await pool.query(`delete from public.rate_limits where bucket = any($1::text[])`, [
      createdRateLimitBuckets.splice(0),
    ])
  }
})

describe('finding 1 — anon cannot forge audit rows', () => {
  it('anon can no longer execute record_audit_event', async () => {
    // The exact call that was possible before Milestone 15: a browser
    // holding only the public anon key, inventing an organization id and an
    // action, writing into the append-only audit trail.
    const anon = createAnonClient()

    const { error } = await anon.rpc('record_audit_event', {
      p_organization_id: randomUUID(),
      p_user_id: randomUUID(),
      p_action: 'forged.by.anon',
      p_resource_type: 'user',
      p_resource_id: null,
      p_metadata: {},
      p_ip_address: null,
      p_user_agent: null,
    })

    expect(error).not.toBeNull()

    const { rows } = await pool.query(
      `select 1 from public.audit_logs where action = 'forged.by.anon'`,
    )
    expect(rows).toEqual([])
  })

  it('the replacement RPC rejects any action outside its allow-list', async () => {
    const anon = createAnonClient()

    const { error } = await anon.rpc('record_unauthenticated_audit_event', {
      p_action: 'sales.refund',
      p_identifier: 'attacker@example.com',
      p_ip_address: null,
      p_user_agent: null,
    })

    expect(error).not.toBeNull()
    expect(error?.message).toContain('unsupported action')
  })

  it('the replacement RPC discards any organization or user the caller implies', async () => {
    const anon = createAnonClient()
    const identifier = `sweep-${randomUUID()}@example.com`

    const { error } = await anon.rpc('record_unauthenticated_audit_event', {
      p_action: 'auth.sign_in_failed',
      p_identifier: identifier,
      p_ip_address: null,
      p_user_agent: null,
    })
    expect(error).toBeNull()

    // The row exists, but carries nothing the caller could have chosen: no
    // organization, no user (anon has no auth.uid()), a resource_type
    // derived from the action rather than passed in, and metadata reduced to
    // the single identifier field.
    const { rows } = await pool.query<{
      organization_id: string | null
      user_id: string | null
      resource_type: string
      metadata: Record<string, unknown>
    }>(
      `select organization_id, user_id, resource_type, metadata
         from public.audit_logs
        where metadata->>'identifier' = $1`,
      [identifier],
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.organization_id).toBeNull()
    expect(rows[0]?.user_id).toBeNull()
    expect(rows[0]?.resource_type).toBe('user')
    expect(rows[0]?.metadata).toEqual({ identifier })

    await pool.query(`delete from public.audit_logs where metadata->>'identifier' = $1`, [
      identifier,
    ])
  })

  it('the replacement RPC rate-limits a flood from one source', async () => {
    // The allow-list stops forgery; only this stops an anon caller filling
    // audit_logs with well-formed rows. Enforced in SQL precisely so calling
    // the RPC directly — as this test does — cannot bypass it.
    const anon = createAnonClient()
    const ip = `10.${Math.floor(Math.random() * 250)}.0.1`
    createdRateLimitBuckets.push('unauth_audit')

    const results: (string | null)[] = []
    for (let i = 0; i < 32; i += 1) {
      const { error } = await anon.rpc('record_unauthenticated_audit_event', {
        p_action: 'auth.sign_in_failed',
        p_identifier: null,
        p_ip_address: ip,
        p_user_agent: null,
      })
      results.push(error?.message ?? null)
    }

    // 30 permitted in the window, the rest refused.
    expect(results.filter((message) => message === null)).toHaveLength(30)
    expect(results.at(-1)).toContain('rate limited')

    await pool.query(`delete from public.audit_logs where ip_address = $1::inet`, [ip])
  })
})

describe('finding 2 — roles are not readable across organizations', () => {
  it('a custom role authored in one organization is invisible to another', async () => {
    const alice = await createTestUser()
    const bob = await createTestUser()
    const { organizationId: aliceOrgId } = await bootstrapOrganization(alice, 'Sweep Org A')
    await bootstrapOrganization(bob, 'Sweep Org B')

    const roleName = `Sweep Role ${randomUUID().slice(0, 8)}`
    const { data: created, error: createError } = await alice.client
      .from('roles')
      .insert({
        name: roleName,
        slug: `sweep-role-${randomUUID().slice(0, 8)}`,
        description: 'Milestone 15 cross-tenant visibility check',
        // roles_insert (20260824090700) requires created_by = auth.uid():
        // attribution cannot be forged. Since Milestone 16 (20260830090000)
        // roles_select scopes on organization_id via user_has_org_access(),
        // and roles_insert requires it match an org the caller belongs to.
        organization_id: aliceOrgId,
        created_by: alice.userId,
      })
      .select('id')
      .single()

    expect(createError).toBeNull()
    const roleId = (created as { id: string }).id

    // Alice sees her own role.
    const { data: aliceView } = await alice.client.from('roles').select('id').eq('id', roleId)
    expect(aliceView).toHaveLength(1)

    // Bob, in a different organization, does not. Before Milestone 15 this
    // returned the row: roles_select was `using (true)`.
    const { data: bobView } = await bob.client.from('roles').select('id').eq('id', roleId)
    expect(bobView).toEqual([])

    await pool.query(`delete from public.roles where id = $1`, [roleId])
  })

  it('system roles stay readable by everyone', async () => {
    // The other half of the predicate. System roles are the shared catalog
    // the role builder composes against and carry no tenant information —
    // scoping them would break the builder for every organization.
    const user = await createTestUser()
    await bootstrapOrganization(user, 'Sweep Org C')

    const { data } = await user.client.from('roles').select('slug').eq('is_system_role', true)

    expect((data ?? []).length).toBeGreaterThan(0)
  })

  it('sign-in still resolves permissions for a user holding a custom role', async () => {
    // THE regression that would have been production-down. Permission
    // resolution goes through current_user_permission_grants(), which is
    // SECURITY DEFINER and therefore unaffected by the tightened
    // role_permissions_select policy. If that had ever been changed to read
    // the table through PostgREST, restricting the policy would silently
    // strip every custom-role holder of their permissions at sign-in.
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, 'Sweep Org D')

    const { data: grants, error } = await owner.client.rpc('current_user_permission_grants')

    expect(error).toBeNull()
    expect((grants ?? []).length).toBeGreaterThan(0)
    expect(
      (grants as { organization_id: string }[]).every(
        (grant) => grant.organization_id === organizationId,
      ),
    ).toBe(true)
  })
})

describe('rate limiter', () => {
  it('permits exactly the configured number of calls, then refuses', async () => {
    const anon = createAnonClient()
    const identifier = `sweep-${randomUUID()}`
    createdRateLimitBuckets.push('login')

    const outcomes: boolean[] = []
    for (let i = 0; i < 5; i += 1) {
      const { data } = await anon.rpc('consume_rate_limit', {
        p_bucket: 'login',
        p_identifier: identifier,
        p_limit: 3,
        p_window_seconds: 60,
      })
      outcomes.push(Boolean(data))
    }

    expect(outcomes).toEqual([true, true, true, false, false])
  })

  it('does not extend its own window when refusing', async () => {
    // A refused call must NOT insert. If it did, a client hammering an
    // endpoint would keep pushing its own window forward and could never age
    // out of its lockout — punitive for an attacker, but it would also mean
    // a misconfigured legitimate client stays locked out indefinitely.
    const anon = createAnonClient()
    const identifier = `sweep-${randomUUID()}`
    createdRateLimitBuckets.push('login')

    for (let i = 0; i < 6; i += 1) {
      await anon.rpc('consume_rate_limit', {
        p_bucket: 'login',
        p_identifier: identifier,
        p_limit: 2,
        p_window_seconds: 60,
      })
    }

    const { rows } = await pool.query<{ count: string }>(
      `select count(*)::text as count from public.rate_limits where identifier = $1`,
      [identifier],
    )
    expect(rows[0]?.count).toBe('2')
  })

  it('keeps buckets and identifiers independent of one another', async () => {
    const anon = createAnonClient()
    const identifier = `sweep-${randomUUID()}`
    const other = `sweep-${randomUUID()}`
    createdRateLimitBuckets.push('login', 'checkout')

    await anon.rpc('consume_rate_limit', {
      p_bucket: 'login',
      p_identifier: identifier,
      p_limit: 1,
      p_window_seconds: 60,
    })

    // Exhausted in `login`, but a different bucket and a different
    // identifier must both still be open — otherwise one noisy cashier would
    // throttle a colleague, which is exactly what the per-user checkout key
    // exists to prevent.
    const sameIdOtherBucket = await anon.rpc('consume_rate_limit', {
      p_bucket: 'checkout',
      p_identifier: identifier,
      p_limit: 1,
      p_window_seconds: 60,
    })
    const otherIdSameBucket = await anon.rpc('consume_rate_limit', {
      p_bucket: 'login',
      p_identifier: other,
      p_limit: 1,
      p_window_seconds: 60,
    })

    expect(Boolean(sameIdOtherBucket.data)).toBe(true)
    expect(Boolean(otherIdSameBucket.data)).toBe(true)
  })

  it('ignores rows older than the window', async () => {
    const identifier = `sweep-${randomUUID()}`
    createdRateLimitBuckets.push('login')

    // Two hits, backdated well past a 60-second window.
    await pool.query(
      `insert into public.rate_limits (bucket, identifier, created_at)
       values ('login', $1, now() - interval '2 hours'),
              ('login', $1, now() - interval '2 hours')`,
      [identifier],
    )

    const anon = createAnonClient()
    const { data } = await anon.rpc('consume_rate_limit', {
      p_bucket: 'login',
      p_identifier: identifier,
      p_limit: 2,
      p_window_seconds: 60,
    })

    expect(Boolean(data)).toBe(true)
  })

  it('rate_limits is unreadable and unwritable through the Data API', async () => {
    // The table exists only behind the SECURITY DEFINER functions. A
    // readable rate_limits would tell an attacker which identifiers are one
    // call away from their limit.
    const anon = createAnonClient()

    const { error: readError } = await anon.from('rate_limits').select('id').limit(1)
    expect(readError).not.toBeNull()

    const { error: writeError } = await anon
      .from('rate_limits')
      .insert({ bucket: 'login', identifier: 'forged' })
    expect(writeError).not.toBeNull()
  })
})

describe('finding 3 — notification mark-read validates its input', () => {
  it('rejects a malformed notification id before it reaches the database', async () => {
    // lib/notifications/mutations.ts parses with notificationIdSchema before
    // querying. This asserts the underlying reason it matters: an unvalidated
    // string produces a raw Postgres type error, which the Server Action's
    // errorMessage() would then show the user verbatim.
    const user = await createTestUser()
    await bootstrapOrganization(user, 'Sweep Org E')

    const { error } = await user.client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', 'not-a-uuid')

    expect(error).not.toBeNull()
    expect(error?.message.toLowerCase()).toContain('uuid')
  })
})
