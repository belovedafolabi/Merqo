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

  it('loads exactly 7 system roles', async () => {
    const result = await pool.query(`select count(*)::int as count from public.roles`)
    expect(result.rows[0].count).toBe(7)
  })

  it('loads the expected 7 role slugs, all marked is_system_role', async () => {
    const result = await pool.query(`select slug, is_system_role from public.roles order by slug`)
    expect(result.rows.map((row) => row.slug)).toEqual(
      [
        'branch_manager',
        'cashier',
        'kitchen_staff',
        'owner',
        'pharmacist',
        'salesperson',
        'waiter',
      ].sort(),
    )
    expect(result.rows.every((row) => row.is_system_role)).toBe(true)
  })

  // 16 from Milestones 03–05 + 6 from Milestone 06 (products.view/create/
  // update/archive/view_cost_price, categories.manage) + 3 from Milestone 07
  // (inventory.view/adjust/transfer).
  it('loads exactly 25 permissions', async () => {
    const result = await pool.query(`select count(*)::int as count from public.permissions`)
    expect(result.rows[0].count).toBe(25)
  })

  it('the Owner role holds every seeded permission', async () => {
    const result = await pool.query(
      `select count(*)::int as count
       from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.slug = 'owner'`,
    )
    expect(result.rows[0].count).toBe(25)
  })

  it('the operational roles (Cashier, Salesperson, Pharmacist, Waiter, Kitchen Staff) start with zero permissions', async () => {
    const result = await pool.query(
      `select r.slug, count(rp.id)::int as permission_count
       from public.roles r
       left join public.role_permissions rp on rp.role_id = r.id
       where r.slug in ('cashier', 'salesperson', 'pharmacist', 'waiter', 'kitchen_staff')
       group by r.slug`,
    )
    expect(result.rows.every((row) => row.permission_count === 0)).toBe(true)
  })

  // Deliberately not asserting user_roles is empty here: unlike M02 (where
  // nothing else in the suite ever wrote to these tables), this milestone's
  // own auth/RLS/authorization integration tests create real users and
  // bootstrap real organizations via live Supabase Auth sign-ups — genuine
  // commits, not rollback-wrapped like the schema/constraint tests — so by
  // the time this file runs in the same `pnpm test:integration` process,
  // user_roles legitimately has rows. supabase/seed.sql's own comment
  // documents that it seeds none itself; that's verified by inspection of
  // the seed script (a static insert-count review), not by a runtime
  // assertion that other files' side effects would make order-dependent.
})
