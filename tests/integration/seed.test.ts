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

  // Scoped to is_system_role = true, not a bare count(*) on the table: since
  // Milestone 11 (20260824090700_alter_roles_add_authoring_policies.sql),
  // public.roles legitimately holds custom roles too — created by the
  // role-builder tests in this same suite (tests/integration/role-builder.test.ts,
  // tests/integration/employees.test.ts, tests/integration/deactivation.test.ts)
  // as well as by real usage. What this test actually verifies — that the seed
  // migration planted exactly these 7 built-in roles — only makes sense
  // filtered to the built-in ones.
  it('loads exactly 7 system roles', async () => {
    const result = await pool.query(
      `select count(*)::int as count from public.roles where is_system_role = true`,
    )
    expect(result.rows[0].count).toBe(7)
  })

  it('loads the expected 7 system role slugs', async () => {
    const result = await pool.query(
      `select slug from public.roles where is_system_role = true order by slug`,
    )
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
  })

  // 16 from Milestones 03–05 + 6 from Milestone 06 (products.view/create/
  // update/archive/view_cost_price, categories.manage) + 3 from Milestone 07
  // (inventory.view/adjust/transfer) + 8 from Milestone 08 (sales.view/
  // create/cancel, discount.apply/override, returns.create, refund.initiate/
  // approve) + 10 from Milestone 09 (customers.view/create/update,
  // store_credit.view/issue/adjust, layaway.view/create/record_payment/
  // cancel) + 9 from Milestone 10 (reports.view/export/view_financials/
  // view_all_branches/save, expense.view/create/approve/delete) + 3 from
  // Milestone 11 (roles.create, employees.invite, employees.deactivate).
  it('loads exactly 55 permissions', async () => {
    const result = await pool.query(`select count(*)::int as count from public.permissions`)
    expect(result.rows[0].count).toBe(55)
  })

  it('the Owner role holds every seeded permission', async () => {
    const result = await pool.query(
      `select count(*)::int as count
       from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.slug = 'owner'`,
    )
    expect(result.rows[0].count).toBe(55)
  })

  // Waiter/Kitchen Staff are still bare (the base till set is scoped to
  // Cashier/Salesperson/Pharmacist — supabase/seed.sql's
  // pos_operator_permissions comment). Cashier/Salesperson/Pharmacist hold
  // 12: Milestone 08's 6-permission base till set (sales.view/create/cancel,
  // discount.apply, returns.create, refund.initiate) plus Milestone 09's 6
  // customer-facing ones (customers.view/create, store_credit.view,
  // layaway.view/create/record_payment). The elevated actions in both
  // milestones — discount.override, refund.approve, store_credit.issue/
  // adjust, layaway.cancel, customers.update — stay Branch Manager/
  // Owner-only, so each milestone updates rather than removes this
  // assertion.
  //
  // Milestone 10 adds exactly one to the till set: `reports.view`, taking it
  // to 13. That grants no new data access — they can already read their own
  // branch's sales through sales_select, and the report functions are SECURITY
  // INVOKER — it just lets them see their own day's numbers added up. The four
  // deliberately withheld are reports.export (the exfiltration surface),
  // reports.view_financials (cost price), reports.save, and every expense.*
  // key (docs/PRD.md §27: "A cashier should not automatically have the ability
  // to create a ₦500,000 expense").
  it('Waiter and Kitchen Staff still start with zero permissions; Cashier/Salesperson/Pharmacist hold the base till set', async () => {
    const result = await pool.query(
      `select r.slug, count(rp.id)::int as permission_count
       from public.roles r
       left join public.role_permissions rp on rp.role_id = r.id
       where r.slug in ('cashier', 'salesperson', 'pharmacist', 'waiter', 'kitchen_staff')
       group by r.slug`,
    )
    const bySlug = Object.fromEntries(result.rows.map((row) => [row.slug, row.permission_count]))
    expect(bySlug).toEqual({
      cashier: 13,
      salesperson: 13,
      pharmacist: 13,
      waiter: 0,
      kitchen_staff: 0,
    })
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
