import { afterAll, describe, expect, it } from 'vitest'
import { pool, withTransaction } from './helpers/db'

describe('uniqueness and not-null constraints', () => {
  afterAll(async () => {
    await pool.end()
  })

  it('rejects a duplicate business_types.slug', async () => {
    await withTransaction(async (client) => {
      await client.query(
        `insert into public.business_types (slug, name) values ('dup-type', 'Dup Type')`,
      )
      await expect(
        client.query(
          `insert into public.business_types (slug, name) values ('dup-type', 'Dup Type Again')`,
        ),
      ).rejects.toMatchObject({ code: '23505' })
    })
  })

  it('rejects a duplicate capabilities.key', async () => {
    await withTransaction(async (client) => {
      await client.query(
        `insert into public.capabilities (key, name) values ('dup-cap', 'Dup Cap')`,
      )
      await expect(
        client.query(
          `insert into public.capabilities (key, name) values ('dup-cap', 'Dup Cap Again')`,
        ),
      ).rejects.toMatchObject({ code: '23505' })
    })
  })

  it('rejects a duplicate (organization_id, slug) among active branches', async () => {
    await withTransaction(async (client) => {
      const org = await client.query(
        `insert into public.organizations (name, slug) values ('Dup Org', 'dup-org') returning id`,
      )
      await client.query(
        `insert into public.branches (organization_id, name, slug) values ($1, 'Branch A', 'branch-a')`,
        [org.rows[0].id],
      )
      await expect(
        client.query(
          `insert into public.branches (organization_id, name, slug) values ($1, 'Branch A Dup', 'branch-a')`,
          [org.rows[0].id],
        ),
      ).rejects.toMatchObject({ code: '23505' })
    })
  })

  it('rejects a duplicate (branch_id, slug) among active business units', async () => {
    await withTransaction(async (client) => {
      const org = await client.query(
        `insert into public.organizations (name, slug) values ('Dup Org 2', 'dup-org-2') returning id`,
      )
      const branch = await client.query(
        `insert into public.branches (organization_id, name, slug) values ($1, 'Branch B', 'branch-b') returning id`,
        [org.rows[0].id],
      )
      const businessType = await client.query(
        `select id from public.business_types where slug = 'supermarket'`,
      )
      await client.query(
        `insert into public.business_units (branch_id, business_type_id, name, slug)
         values ($1, $2, 'BU A', 'bu-a')`,
        [branch.rows[0].id, businessType.rows[0].id],
      )
      await expect(
        client.query(
          `insert into public.business_units (branch_id, business_type_id, name, slug)
           values ($1, $2, 'BU A Dup', 'bu-a')`,
          [branch.rows[0].id, businessType.rows[0].id],
        ),
      ).rejects.toMatchObject({ code: '23505' })
    })
  })

  it('rejects a duplicate (business_unit_id, capability_id) in business_unit_capabilities', async () => {
    await withTransaction(async (client) => {
      const org = await client.query(
        `insert into public.organizations (name, slug) values ('Dup Org 3', 'dup-org-3') returning id`,
      )
      const branch = await client.query(
        `insert into public.branches (organization_id, name, slug) values ($1, 'Branch C', 'branch-c') returning id`,
        [org.rows[0].id],
      )
      const businessType = await client.query(
        `select id from public.business_types where slug = 'supermarket'`,
      )
      const businessUnit = await client.query(
        `insert into public.business_units (branch_id, business_type_id, name, slug)
         values ($1, $2, 'BU C', 'bu-c') returning id`,
        [branch.rows[0].id, businessType.rows[0].id],
      )
      const capability = await client.query(
        `select id from public.capabilities where key = 'products'`,
      )
      // The seeding trigger already inserted this pair — a second explicit insert must fail.
      await expect(
        client.query(
          `insert into public.business_unit_capabilities (business_unit_id, capability_id, enabled)
           values ($1, $2, true)`,
          [businessUnit.rows[0].id, capability.rows[0].id],
        ),
      ).rejects.toMatchObject({ code: '23505' })
    })
  })

  it('rejects a null organization_id on branches (NOT NULL)', async () => {
    await withTransaction(async (client) => {
      await expect(
        client.query(
          `insert into public.branches (organization_id, name, slug) values (null, 'No Org', 'no-org')`,
        ),
      ).rejects.toMatchObject({ code: '23502' })
    })
  })
})
