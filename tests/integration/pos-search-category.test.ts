import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'

import { pool, withTransaction } from './helpers/db'

/**
 * pos_search_products() gained an optional p_category_id (20260908090300) so
 * the POS's always-visible chip row can browse a category with the search
 * box empty. This checks the new predicate: an empty term + a category id
 * lists the whole category, and a term + a category id intersects the two.
 * Logic check over the pg pool — RLS scoping is unchanged and covered
 * elsewhere.
 */

afterAll(async () => {
  await pool.end()
})

async function seed(client: Parameters<Parameters<typeof withTransaction>[0]>[0]) {
  const suffix = randomUUID().slice(0, 8)
  const typeId = (
    await client.query(`select id from public.business_types where slug = 'restaurant'`)
  ).rows[0].id
  const org = (
    await client.query(
      `insert into public.organizations (name, slug) values ('Cat Org', $1) returning id`,
      [`cat-org-${suffix}`],
    )
  ).rows[0].id
  const branch = (
    await client.query(
      `insert into public.branches (organization_id, name, slug) values ($1, 'B', $2) returning id`,
      [org, `cat-b-${suffix}`],
    )
  ).rows[0].id
  const bu = (
    await client.query(
      `insert into public.business_units (branch_id, business_type_id, name, slug)
       values ($1, $2, 'U', $3) returning id`,
      [branch, typeId, `cat-u-${suffix}`],
    )
  ).rows[0].id
  const drinks = (
    await client.query(
      `insert into public.categories (business_unit_id, name) values ($1, 'Drinks') returning id`,
      [bu],
    )
  ).rows[0].id
  const mains = (
    await client.query(
      `insert into public.categories (business_unit_id, name) values ($1, 'Mains') returning id`,
      [bu],
    )
  ).rows[0].id
  await client.query(
    `insert into public.products (business_unit_id, category_id, name, sku, base_price, cost_price) values
       ($1, $2, 'Chapman', $3, 1800, 700),
       ($1, $2, 'Zobo', $4, 1200, 400),
       ($1, $5, 'Jollof Rice', $6, 4500, 1800)`,
    [bu, drinks, `SKU-${suffix}-1`, `SKU-${suffix}-2`, mains, `SKU-${suffix}-3`],
  )
  return { bu, drinks, mains }
}

describe('pos_search_products p_category_id', () => {
  it('empty term + category lists the whole category', async () => {
    await withTransaction(async (client) => {
      const { bu, drinks } = await seed(client)
      const { rows } = await client.query(
        `select name from public.pos_search_products($1, '', 50, $2) order by name`,
        [bu, drinks],
      )
      expect(rows.map((r) => r.name)).toEqual(['Chapman', 'Zobo'])
    })
  })

  it('term + category intersects both', async () => {
    await withTransaction(async (client) => {
      const { bu, drinks, mains } = await seed(client)
      // "o" matches Chapman/Zobo/Jollof; scoped to Drinks it drops Jollof.
      const drinksHits = await client.query(
        `select name from public.pos_search_products($1, 'o', 50, $2) order by name`,
        [bu, drinks],
      )
      expect(drinksHits.rows.map((r) => r.name)).toEqual(['Chapman', 'Zobo'])

      const mainsHits = await client.query(
        `select name from public.pos_search_products($1, 'o', 50, $2)`,
        [bu, mains],
      )
      expect(mainsHits.rows.map((r) => r.name)).toEqual(['Jollof Rice'])
    })
  })

  it('null category is unchanged (all matches)', async () => {
    await withTransaction(async (client) => {
      const { bu } = await seed(client)
      const { rows } = await client.query(
        `select count(*)::int as n from public.pos_search_products($1, 'o', 50, null)`,
        [bu],
      )
      expect(rows[0].n).toBe(3)
    })
  })
})
