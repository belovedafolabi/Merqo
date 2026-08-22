import { afterAll, describe, expect, it } from 'vitest'
import { pool } from './helpers/db'

describe('seed data (supabase/seed.sql)', () => {
  afterAll(async () => {
    await pool.end()
  })

  it('loads exactly 13 business types', async () => {
    const result = await pool.query(`select count(*)::int as count from public.business_types`)
    expect(result.rows[0].count).toBe(13)
  })

  it('loads the expected 13 business type slugs', async () => {
    const result = await pool.query(`select slug from public.business_types order by slug`)
    expect(result.rows.map((row) => row.slug)).toEqual(
      [
        'bakeries',
        'beauty_salons_barbers',
        'clothing_fashion',
        'convenience_store',
        'electronics',
        'general_retail',
        'hardware_building_materials',
        'hotels',
        'other',
        'pharmacy',
        'restaurant',
        'supermarket',
        'wholesalers',
      ].sort(),
    )
  })

  it('loads exactly 7 capabilities', async () => {
    const result = await pool.query(`select count(*)::int as count from public.capabilities`)
    expect(result.rows[0].count).toBe(7)
  })

  it('loads the expected 7 capability keys', async () => {
    const result = await pool.query(`select key from public.capabilities order by key`)
    expect(result.rows.map((row) => row.key)).toEqual(
      [
        'batch_tracking',
        'expiry_tracking',
        'inventory',
        'layaway',
        'products',
        'service_charge',
        'store_credit',
      ].sort(),
    )
  })

  it('loads a complete 13x7 = 91-row business_type_capabilities matrix', async () => {
    const result = await pool.query(
      `select count(*)::int as count from public.business_type_capabilities`,
    )
    expect(result.rows[0].count).toBe(91)
  })

  it('does not seed roles, permissions, role_permissions, or user_roles (Milestone 03 scope)', async () => {
    const tables = ['roles', 'permissions', 'role_permissions', 'user_roles']
    for (const table of tables) {
      const result = await pool.query(`select count(*)::int as count from public.${table}`)
      expect(result.rows[0].count, `expected ${table} to be empty`).toBe(0)
    }
  })
})
