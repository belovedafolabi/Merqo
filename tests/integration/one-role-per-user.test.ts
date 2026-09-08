import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'

import { pool } from './helpers/db'
import { bootstrapOrganization, createTestUser } from './helpers/supabase'

/**
 * Milestone 17 Part E item 5 — a user holds exactly one role
 * (migration 20260908090700; DECISIONS_AND_CONFLICTS.md §8). This is the DB
 * invariant; "assign = replace" is the app-layer consequence, exercised here
 * as raw SQL the way tests/integration/role-builder.test.ts does.
 */
describe('one role per user', () => {
  afterAll(async () => {
    await pool.end()
  })

  it('replaced the non-unique user_id index with a UNIQUE one', async () => {
    const { rows } = await pool.query<{ indexdef: string }>(
      `select indexdef from pg_indexes
       where schemaname = 'public' and tablename = 'user_roles'
         and indexdef ilike '%(user_id)%'`,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.indexdef).toMatch(/CREATE UNIQUE INDEX/i)
  })

  it('rejects a second role assignment for the same user', async () => {
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(
      owner,
      `OneRole ${randomUUID().slice(0, 6)}`,
    )

    const member = await createTestUser()
    const cashier = await pool.query(`select id from public.roles where slug = 'cashier'`)
    const manager = await pool.query(`select id from public.roles where slug = 'branch_manager'`)

    await pool.query(
      `insert into public.user_roles (user_id, role_id, organization_id) values ($1, $2, $3)`,
      [member.userId, cashier.rows[0].id, organizationId],
    )

    await expect(
      pool.query(
        `insert into public.user_roles (user_id, role_id, organization_id) values ($1, $2, $3)`,
        [member.userId, manager.rows[0].id, organizationId],
      ),
    ).rejects.toMatchObject({ code: '23505' })
  })

  it('lets a role be swapped by deleting the old assignment first (the replace path)', async () => {
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(
      owner,
      `Swap ${randomUUID().slice(0, 6)}`,
    )

    const member = await createTestUser()
    const cashier = await pool.query(`select id from public.roles where slug = 'cashier'`)
    const manager = await pool.query(`select id from public.roles where slug = 'branch_manager'`)

    await pool.query(
      `insert into public.user_roles (user_id, role_id, organization_id) values ($1, $2, $3)`,
      [member.userId, cashier.rows[0].id, organizationId],
    )
    await pool.query(`delete from public.user_roles where user_id = $1`, [member.userId])
    await pool.query(
      `insert into public.user_roles (user_id, role_id, organization_id) values ($1, $2, $3)`,
      [member.userId, manager.rows[0].id, organizationId],
    )

    const { rows } = await pool.query<{ count: string }>(
      `select count(*) from public.user_roles where user_id = $1`,
      [member.userId],
    )
    expect(Number(rows[0]!.count)).toBe(1)
  })
})
