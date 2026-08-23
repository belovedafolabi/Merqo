import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { pool, withTransaction } from './helpers/db'

describe('core hierarchy schema', () => {
  afterAll(async () => {
    await pool.end()
  })

  it('rejects a branch referencing a non-existent organization (FK violation)', async () => {
    await withTransaction(async (client) => {
      await expect(
        client.query(
          `insert into public.branches (organization_id, name, slug) values ($1, 'Bad Branch', 'bad-branch')`,
          [randomUUID()],
        ),
      ).rejects.toMatchObject({ code: '23503' })
    })
  })

  it('rejects a business unit referencing a non-existent branch (FK violation)', async () => {
    await withTransaction(async (client) => {
      const businessType = await client.query(
        `insert into public.business_types (slug, name) values ('test-type', 'Test Type') returning id`,
      )
      await expect(
        client.query(
          `insert into public.business_units (branch_id, business_type_id, name, slug)
           values ($1, $2, 'Bad BU', 'bad-bu')`,
          [randomUUID(), businessType.rows[0].id],
        ),
      ).rejects.toMatchObject({ code: '23503' })
    })
  })

  it('rejects a business unit referencing a non-existent business type (FK violation)', async () => {
    await withTransaction(async (client) => {
      const org = await client.query(
        `insert into public.organizations (name, slug) values ('Test Org', 'test-org') returning id`,
      )
      const branch = await client.query(
        `insert into public.branches (organization_id, name, slug) values ($1, 'Test Branch', 'test-branch') returning id`,
        [org.rows[0].id],
      )
      await expect(
        client.query(
          `insert into public.business_units (branch_id, business_type_id, name, slug)
           values ($1, $2, 'Bad BU', 'bad-bu')`,
          [branch.rows[0].id, randomUUID()],
        ),
      ).rejects.toMatchObject({ code: '23503' })
    })
  })

  it('a business unit references exactly one business type via a single NOT NULL FK', async () => {
    await withTransaction(async (client) => {
      const org = await client.query(
        `insert into public.organizations (name, slug) values ('Test Org', 'test-org') returning id`,
      )
      const branch = await client.query(
        `insert into public.branches (organization_id, name, slug) values ($1, 'Test Branch', 'test-branch') returning id`,
        [org.rows[0].id],
      )
      await expect(
        client.query(
          `insert into public.business_units (branch_id, business_type_id, name, slug)
           values ($1, null, 'No Type BU', 'no-type-bu')`,
          [branch.rows[0].id],
        ),
      ).rejects.toMatchObject({ code: '23502' }) // not_null_violation
    })
  })

  it('RESTRICTs deleting an organization that still has branches', async () => {
    await withTransaction(async (client) => {
      const org = await client.query(
        `insert into public.organizations (name, slug) values ('Test Org', 'test-org') returning id`,
      )
      await client.query(
        `insert into public.branches (organization_id, name, slug) values ($1, 'Test Branch', 'test-branch')`,
        [org.rows[0].id],
      )
      await expect(
        client.query(`delete from public.organizations where id = $1`, [org.rows[0].id]),
      ).rejects.toMatchObject({ code: '23503' })
    })
  })

  it('archived_at exists only on operational/tenant entities (docs/architecture/database-conventions.md)', async () => {
    const result = await pool.query(
      `select table_name from information_schema.columns
       where table_schema = 'public' and column_name = 'archived_at'
       order by table_name`,
    )
    const tables = result.rows.map((row) => row.table_name)
    // Milestone 06 adds categories/products/product_variants — tenant data
    // with the same soft-delete lifecycle as branches/business_units, per
    // this milestone's own FR ("archiving, not hard deletion").
    expect(tables).toEqual([
      'branches',
      'business_units',
      'categories',
      'organizations',
      'product_variants',
      'products',
    ])
  })

  it('updated_at is bumped by the shared set_updated_at trigger on UPDATE', async () => {
    await withTransaction(async (client) => {
      const inserted = await client.query(
        `insert into public.business_types (slug, name) values ('trigger-test', 'Trigger Test')
         returning id, updated_at`,
      )
      const before = inserted.rows[0].updated_at as Date

      // Ensure a measurable clock difference.
      await new Promise((resolve) => setTimeout(resolve, 10))

      const updated = await client.query(
        `update public.business_types set name = 'Trigger Test Updated' where id = $1 returning updated_at`,
        [inserted.rows[0].id],
      )
      const after = updated.rows[0].updated_at as Date

      expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime())
    })
  })
})
