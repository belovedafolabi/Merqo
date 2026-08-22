import { afterAll, describe, expect, it } from 'vitest'
import { pool, withTransaction } from './helpers/db'

describe('capability engine (business_type_capabilities -> business_unit_capabilities)', () => {
  afterAll(async () => {
    await pool.end()
  })

  it('seeds pharmacy defaults matching docs/TAS.md §8 (batch_tracking, expiry_tracking on)', async () => {
    const result = await pool.query(
      `select c.key, btc.default_enabled
       from public.business_type_capabilities btc
       join public.business_types bt on bt.id = btc.business_type_id
       join public.capabilities c on c.id = btc.capability_id
       where bt.slug = 'pharmacy' and btc.default_enabled = true
       order by c.key`,
    )
    const enabledKeys = result.rows.map((row) => row.key)
    expect(enabledKeys).toEqual(
      expect.arrayContaining(['batch_tracking', 'expiry_tracking', 'inventory', 'products']),
    )
  })

  it('seeds restaurant defaults matching docs/TAS.md §8 (service_charge on)', async () => {
    const result = await pool.query(
      `select c.key from public.business_type_capabilities btc
       join public.business_types bt on bt.id = btc.business_type_id
       join public.capabilities c on c.id = btc.capability_id
       where bt.slug = 'restaurant' and btc.default_enabled = true
       order by c.key`,
    )
    const enabledKeys = result.rows.map((row) => row.key)
    expect(enabledKeys).toEqual(expect.arrayContaining(['inventory', 'products', 'service_charge']))
  })

  it('inserting a business unit auto-populates business_unit_capabilities from its business type defaults', async () => {
    await withTransaction(async (client) => {
      const org = await client.query(
        `insert into public.organizations (name, slug) values ('Cap Org', 'cap-org') returning id`,
      )
      const branch = await client.query(
        `insert into public.branches (organization_id, name, slug) values ($1, 'Cap Branch', 'cap-branch') returning id`,
        [org.rows[0].id],
      )
      const pharmacyType = await client.query(
        `select id from public.business_types where slug = 'pharmacy'`,
      )
      const businessUnit = await client.query(
        `insert into public.business_units (branch_id, business_type_id, name, slug)
         values ($1, $2, 'Cap Pharmacy', 'cap-pharmacy') returning id`,
        [branch.rows[0].id, pharmacyType.rows[0].id],
      )

      const capabilityCount = await client.query(
        `select count(*)::int as count from public.business_unit_capabilities where business_unit_id = $1`,
        [businessUnit.rows[0].id],
      )
      // Exactly 7 rows — one per capability in the curated catalog.
      expect(capabilityCount.rows[0].count).toBe(7)

      const enabled = await client.query(
        `select c.key from public.business_unit_capabilities buc
         join public.capabilities c on c.id = buc.capability_id
         where buc.business_unit_id = $1 and buc.enabled = true
         order by c.key`,
        [businessUnit.rows[0].id],
      )
      expect(enabled.rows.map((row) => row.key)).toEqual(
        expect.arrayContaining(['batch_tracking', 'expiry_tracking', 'inventory', 'products']),
      )
    })
  })

  it('overriding a business unit capability persists independently of the business type default', async () => {
    await withTransaction(async (client) => {
      const org = await client.query(
        `insert into public.organizations (name, slug) values ('Override Org', 'override-org') returning id`,
      )
      const branch = await client.query(
        `insert into public.branches (organization_id, name, slug) values ($1, 'Override Branch', 'override-branch') returning id`,
        [org.rows[0].id],
      )
      const supermarketType = await client.query(
        `select id from public.business_types where slug = 'supermarket'`,
      )
      const businessUnit = await client.query(
        `insert into public.business_units (branch_id, business_type_id, name, slug)
         values ($1, $2, 'Override Supermarket', 'override-supermarket') returning id`,
        [branch.rows[0].id, supermarketType.rows[0].id],
      )
      const layawayCapability = await client.query(
        `select id from public.capabilities where key = 'layaway'`,
      )

      // supermarket's default for layaway is false — override it on.
      await client.query(
        `update public.business_unit_capabilities set enabled = true, is_override = true
         where business_unit_id = $1 and capability_id = $2`,
        [businessUnit.rows[0].id, layawayCapability.rows[0].id],
      )

      const overridden = await client.query(
        `select enabled, is_override from public.business_unit_capabilities
         where business_unit_id = $1 and capability_id = $2`,
        [businessUnit.rows[0].id, layawayCapability.rows[0].id],
      )
      expect(overridden.rows[0]).toEqual({ enabled: true, is_override: true })

      // The business type's own default is untouched by the override.
      const stillDefaultOff = await client.query(
        `select default_enabled from public.business_type_capabilities
         where business_type_id = $1 and capability_id = $2`,
        [supermarketType.rows[0].id, layawayCapability.rows[0].id],
      )
      expect(stillDefaultOff.rows[0].default_enabled).toBe(false)
    })
  })
})
