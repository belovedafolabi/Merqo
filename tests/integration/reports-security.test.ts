import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { fetchPermissionGrants } from '@/lib/auth/context'
import { resolvePermission } from '@/lib/auth/permissions'
import { customReportConfigSchema } from '@/lib/reports/schemas'
import { pool } from './helpers/db'
import { bootstrapOrganization, createAnonClient, createTestUser } from './helpers/supabase'

/**
 * Milestone 10's Testing Requirements: "the custom report builder rejects any
 * attempt to inject raw SQL or access a non-whitelisted dimension/metric; a
 * user without cross-branch reporting permission cannot retrieve another
 * branch's data."
 *
 * Everything here runs through real signed-in supabase-js clients rather than
 * the `pg` pool, because that is the only way to exercise the property that
 * actually matters. The report functions are SECURITY INVOKER precisely so
 * that RLS filters them; as `postgres` (superuser, RLS-exempt) every one of
 * these tests would pass vacuously.
 *
 * The tests below deliberately call the RPCs *directly*, bypassing
 * lib/reports/queries.ts entirely. A caller who wants another branch's numbers
 * is not going to go through the application's permission checks — they will
 * post to /rest/v1/rpc/report_sales_by_scope. That is the threat being tested.
 */

interface Fixture {
  organizationId: string
  branchAId: string
  branchBId: string
  businessUnitAId: string
  businessUnitBId: string
  owner: { client: SupabaseClient; userId: string }
  branchManagerA: { client: SupabaseClient; userId: string }
}

let fixture: Fixture

beforeAll(async () => {
  const suffix = randomUUID().slice(0, 8)

  const owner = await createTestUser()
  const { organizationId } = await bootstrapOrganization(owner, `ReportSec${suffix}`)

  const typeResult = await pool.query(
    `select id from public.business_types where slug = 'supermarket'`,
  )
  const typeId = typeResult.rows[0].id

  // bootstrapOrganization creates the organization and the owner's role
  // assignment, nothing else — both branches are created here. Two of them,
  // because "a branch-scoped user cannot see another branch" needs another
  // branch to exist.
  const insertBranch = async (name: string, slug: string) =>
    (
      await pool.query(
        `insert into public.branches (organization_id, name, slug) values ($1, $2, $3) returning id`,
        [organizationId, name, slug],
      )
    ).rows[0].id as string

  const branchAId = await insertBranch('Branch A', `repsec-a-${suffix}`)
  const branchBId = await insertBranch('Branch B', `repsec-b-${suffix}`)

  const unitA = await pool.query(
    `insert into public.business_units (branch_id, business_type_id, name, slug)
     values ($1, $2, 'Unit A1', $3) returning id`,
    [branchAId, typeId, `repsec-ua1-${suffix}`],
  )
  const unitA2 = await pool.query(
    `insert into public.business_units (branch_id, business_type_id, name, slug)
     values ($1, $2, 'Unit A2', $3) returning id`,
    [branchAId, typeId, `repsec-ua2-${suffix}`],
  )
  const unitB = await pool.query(
    `insert into public.business_units (branch_id, business_type_id, name, slug)
     values ($1, $2, 'Unit B1', $3) returning id`,
    [branchBId, typeId, `repsec-ub1-${suffix}`],
  )

  // One sale in each branch, so "zero rows" is a meaningful result rather than
  // the answer to an empty database.
  await seedSale(organizationId, branchAId, unitA.rows[0].id, `SEC-A-${suffix}`, 1_000)
  await seedSale(organizationId, branchAId, unitA2.rows[0].id, `SEC-A2-${suffix}`, 400)
  await seedSale(organizationId, branchBId, unitB.rows[0].id, `SEC-B-${suffix}`, 2_000)

  await pool.query(
    `insert into public.expenses
       (organization_id, branch_id, business_unit_id, category, amount, payment_method, expense_date, status)
     values ($1, $2, $3, 'Rent', 5000, 'transfer', current_date, 'approved')`,
    [organizationId, branchBId, unitB.rows[0].id],
  )

  const branchManagerA = await createTestUser()
  const managerRole = await pool.query(`select id from public.roles where slug = 'branch_manager'`)
  // Scoped to Branch A only — this is what makes them unable to see Branch B,
  // both in RLS and in every report built on it.
  await pool.query(
    `insert into public.user_roles (user_id, role_id, organization_id, branch_id)
     values ($1, $2, $3, $4)`,
    [branchManagerA.userId, managerRole.rows[0].id, organizationId, branchAId],
  )

  fixture = {
    organizationId,
    branchAId,
    branchBId,
    businessUnitAId: unitA.rows[0].id,
    businessUnitBId: unitB.rows[0].id,
    owner: { client: owner.client, userId: owner.userId },
    branchManagerA: { client: branchManagerA.client, userId: branchManagerA.userId },
  }
})

async function seedSale(
  organizationId: string,
  branchId: string,
  businessUnitId: string,
  sku: string,
  amount: number,
): Promise<void> {
  const product = await pool.query(
    `insert into public.products (business_unit_id, name, sku, base_price, cost_price)
     values ($1, 'Sec Product', $2, $3, 100) returning id`,
    [businessUnitId, sku, amount],
  )
  const productId = product.rows[0].id

  await pool.query(
    `select public.record_inventory_movement($1, $2, null, 'ADJUSTMENT', 50, 'seed', null, null)`,
    [branchId, productId],
  )

  await pool.query(
    `select public.create_sale($1, $2, $3, $4, $5::jsonb, $6, 0, null, 0, 0, $6, 'cash', $6, null, null)`,
    [
      organizationId,
      branchId,
      businessUnitId,
      randomUUID(),
      JSON.stringify([
        {
          product_id: productId,
          variant_id: null,
          quantity: 1,
          unit_price: amount,
          line_discount: 0,
          line_total: amount,
        },
      ]),
      amount,
    ],
  )
}

afterAll(async () => {
  await pool.end()
})

describe('cross-branch data is invisible, via RLS rather than a filter', () => {
  it('a branch-scoped manager asking for another branch gets nothing', async () => {
    // Note the shape of this test: the manager explicitly *asks for* Branch B.
    // Nothing in the application refuses them — the rows simply are not there,
    // because sales_select never returns them. That is the difference between
    // a security boundary and a UI convention.
    const { data, error } = await fixture.branchManagerA.client.rpc('report_sales_by_scope', {
      p_organization_id: fixture.organizationId,
      p_branch_id: fixture.branchBId,
      p_business_unit_id: null,
      p_from: null,
      p_to: null,
      p_group_by: 'branch',
      p_limit: 500,
    })

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('an unscoped request returns only the branch they can see', async () => {
    const { data, error } = await fixture.branchManagerA.client.rpc('report_sales_by_scope', {
      p_organization_id: fixture.organizationId,
      p_branch_id: null,
      p_business_unit_id: null,
      p_from: null,
      p_to: null,
      p_group_by: 'branch',
      p_limit: 500,
    })

    expect(error).toBeNull()
    const rows = data as Array<{ group_key: string; net_sales: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0]!.group_key).toBe(fixture.branchAId)
    // Branch A's two sales, and not a naira of Branch B's 2,000.
    expect(Number(rows[0]!.net_sales)).toBe(1_400)
  })

  it('the org-wide owner sees both branches', async () => {
    // The control case. Without it, the tests above would also pass against a
    // report function that always returned nothing.
    const { data, error } = await fixture.owner.client.rpc('report_sales_by_scope', {
      p_organization_id: fixture.organizationId,
      p_branch_id: null,
      p_business_unit_id: null,
      p_from: null,
      p_to: null,
      p_group_by: 'branch',
      p_limit: 500,
    })

    expect(error).toBeNull()
    expect(data as unknown[]).toHaveLength(2)
  })

  it('cross-branch invisibility holds for the accounting aggregates too', async () => {
    const { data } = await fixture.branchManagerA.client.rpc('report_accounting_aggregates', {
      p_organization_id: fixture.organizationId,
      p_branch_id: null,
      p_business_unit_id: null,
      p_from: null,
      p_to: null,
    })

    const row = (data as Array<Record<string, string>>)[0]!
    expect(Number(row.gross_sales)).toBe(1_400)
    // Branch B's ₦5,000 rent must not appear in Branch A's profit.
    expect(Number(row.expenses_approved)).toBe(0)
  })

  it('holds for the custom report engine as well', async () => {
    const { data, error } = await fixture.branchManagerA.client.rpc('run_custom_report', {
      p_organization_id: fixture.organizationId,
      p_dataset: 'sales',
      p_dimension_1: 'branch',
      p_metric_1: 'net_sales',
      p_branch_id: fixture.branchBId,
      p_sort: 'metric_1',
      p_sort_direction: 'desc',
      p_limit: 100,
    })

    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

describe('business-unit scoping', () => {
  it('narrows to one business unit when asked', async () => {
    // Worth being precise about what this proves and what it does not.
    // `user_has_branch_access()` checks only user_roles.branch_id, never
    // business_unit_id, so a BU-scoped user currently still sees their whole
    // branch through RLS. Retrofitting that policy is a change to Milestone
    // 08's security model, not a reporting change, and is tracked as a
    // follow-up for Milestone 15's hardening pass. Until then the explicit
    // p_business_unit_id filter is what narrows a report, and this test covers
    // that filter working — not a security boundary.
    const { data } = await fixture.owner.client.rpc('report_sales_by_scope', {
      p_organization_id: fixture.organizationId,
      p_branch_id: fixture.branchAId,
      p_business_unit_id: fixture.businessUnitAId,
      p_from: null,
      p_to: null,
      p_group_by: 'business_unit',
      p_limit: 500,
    })

    const rows = data as Array<{ net_sales: string }>
    expect(rows).toHaveLength(1)
    expect(Number(rows[0]!.net_sales)).toBe(1_000)
  })
})

describe('the custom report engine rejects everything not on its whitelist', () => {
  async function runCustom(overrides: Record<string, unknown>) {
    return fixture.owner.client.rpc('run_custom_report', {
      p_organization_id: fixture.organizationId,
      p_dataset: 'sales',
      p_dimension_1: 'branch',
      p_metric_1: 'net_sales',
      p_sort: 'metric_1',
      p_sort_direction: 'desc',
      p_limit: 100,
      ...overrides,
    })
  }

  it.each([
    "branch'; drop table public.sales; --",
    'branch union select 1',
    '(select cost_price from products)',
    'BRANCH',
  ])('rejects %s as a dimension', async (dimension) => {
    const { error } = await runCustom({ p_dimension_1: dimension })
    expect(error?.message).toMatch(/unknown dimension/)
  })

  it('rejects an unknown metric', async () => {
    const { error } = await runCustom({ p_metric_1: 'cost_price' })
    expect(error?.message).toMatch(/unknown metric/)
  })

  it('rejects an unknown dataset', async () => {
    const { error } = await runCustom({ p_dataset: 'users' })
    expect(error?.message).toMatch(/unknown custom report dataset/)
  })

  it('rejects a dimension that is valid on a different dataset', async () => {
    // `employee` is a real sales dimension and no kind of expense dimension.
    // A whitelist checked globally rather than per dataset would let this
    // through into a query with no such column.
    const { error } = await runCustom({
      p_dataset: 'expenses',
      p_dimension_1: 'employee',
      p_metric_1: 'total_amount',
    })
    expect(error?.message).toMatch(/unknown dimension employee for dataset expenses/)
  })

  it('rejects an injected sort key or direction', async () => {
    expect((await runCustom({ p_sort: 'metric_1; drop table sales' })).error?.message).toMatch(
      /unknown sort key/,
    )
    expect((await runCustom({ p_sort_direction: 'asc; --' })).error?.message).toMatch(
      /unknown sort direction/,
    )
  })

  it('refuses a report with no dimension or no metric', async () => {
    expect((await runCustom({ p_dimension_1: null })).error?.message).toMatch(
      /needs at least one dimension/,
    )
    expect((await runCustom({ p_metric_1: null })).error?.message).toMatch(
      /needs at least one metric/,
    )
  })

  it('left no damage behind — the tables the injections named still exist', async () => {
    const sales = await pool.query(`select count(*)::int as count from public.sales`)
    expect(sales.rows[0].count).toBeGreaterThan(0)
  })
})

describe('a stored saved_reports.config is untrusted input', () => {
  it('is rejected on load when it contains a token that is not on the whitelist', async () => {
    // The attack the three-layer design exists to stop: `config` is jsonb, so
    // Postgres never type-checked it. A row written outside the builder — or
    // edited directly — must not be trusted merely because saved configs
    // normally pass validation.
    const inserted = await pool.query(
      `insert into public.saved_reports
         (organization_id, name, dataset, config, visibility)
       values ($1, $2, 'sales', $3::jsonb, 'private')
       returning id, config`,
      [
        fixture.organizationId,
        `tampered-${randomUUID().slice(0, 8)}`,
        JSON.stringify({
          dataset: 'sales',
          dimensions: ['branch'],
          metrics: ['cost_price'],
          sort: 'metric_1',
          sortDirection: 'desc',
          limit: 100,
        }),
      ],
    )

    const parsed = customReportConfigSchema.safeParse(inserted.rows[0].config)
    expect(parsed.success).toBe(false)
  })

  it('accepts a config that is genuinely valid', async () => {
    const inserted = await pool.query(
      `insert into public.saved_reports
         (organization_id, name, dataset, config, visibility)
       values ($1, $2, 'sales', $3::jsonb, 'private')
       returning config`,
      [
        fixture.organizationId,
        `valid-${randomUUID().slice(0, 8)}`,
        JSON.stringify({
          dataset: 'sales',
          dimensions: ['branch'],
          metrics: ['net_sales'],
          sort: 'metric_1',
          sortDirection: 'desc',
          limit: 100,
        }),
      ],
    )

    expect(customReportConfigSchema.safeParse(inserted.rows[0].config).success).toBe(true)
  })
})

describe('permission catalog', () => {
  it('seeds every Milestone 10 permission', async () => {
    const result = await pool.query(
      `select key from public.permissions where key like 'reports.%' or key like 'expense.%' order by key`,
    )
    expect(result.rows.map((row) => row.key)).toEqual([
      'expense.approve',
      'expense.create',
      'expense.delete',
      'expense.view',
      'reports.export',
      'reports.save',
      'reports.view',
      'reports.view_all_branches',
      'reports.view_financials',
    ])
  })

  it('gives a Branch Manager reporting and expense authority, but not cross-branch or void', async () => {
    const grants = await fetchPermissionGrants(fixture.branchManagerA.client)
    const scope = { organizationId: fixture.organizationId, branchId: fixture.branchAId }

    expect(resolvePermission(grants, 'reports.view', scope)).toBe(true)
    expect(resolvePermission(grants, 'reports.export', scope)).toBe(true)
    expect(resolvePermission(grants, 'reports.view_financials', scope)).toBe(true)
    expect(resolvePermission(grants, 'expense.approve', scope)).toBe(true)

    // The two deliberate exclusions — see supabase/seed.sql section 5f.
    expect(resolvePermission(grants, 'reports.view_all_branches', scope)).toBe(false)
    expect(resolvePermission(grants, 'expense.delete', scope)).toBe(false)
  })

  it('gives a Cashier reporting visibility but no export, financials or expenses', async () => {
    const cashier = await createTestUser()
    const cashierRole = await pool.query(`select id from public.roles where slug = 'cashier'`)
    await pool.query(
      `insert into public.user_roles (user_id, role_id, organization_id, branch_id) values ($1, $2, $3, $4)`,
      [cashier.userId, cashierRole.rows[0].id, fixture.organizationId, fixture.branchAId],
    )

    const grants = await fetchPermissionGrants(cashier.client)
    const scope = { organizationId: fixture.organizationId, branchId: fixture.branchAId }

    expect(resolvePermission(grants, 'reports.view', scope)).toBe(true)
    expect(resolvePermission(grants, 'reports.export', scope)).toBe(false)
    expect(resolvePermission(grants, 'reports.view_financials', scope)).toBe(false)
    expect(resolvePermission(grants, 'reports.save', scope)).toBe(false)
    // docs/PRD.md §27, verbatim: "A cashier should not automatically have the
    // ability to create a ₦500,000 expense."
    expect(resolvePermission(grants, 'expense.create', scope)).toBe(false)
    expect(resolvePermission(grants, 'expense.view', scope)).toBe(false)
  })
})

describe('grants', () => {
  it('never lets an application role update or delete a recorded expense', async () => {
    // The structural guarantee behind "an approved expense cannot be quietly
    // edited after it lands in a published profit figure". Checked at the
    // grant level, because that is what makes it true regardless of policy.
    const result = await pool.query(
      `select privilege_type from information_schema.role_table_grants
       where table_schema = 'public' and table_name = 'expenses'
         and grantee in ('authenticated', 'anon')
       order by privilege_type`,
    )
    const privileges = result.rows.map((row) => row.privilege_type)

    expect(privileges).toContain('SELECT')
    expect(privileges).toContain('INSERT')
    expect(privileges).not.toContain('UPDATE')
    expect(privileges).not.toContain('DELETE')
  })

  it('does not let an anonymous caller run a report', async () => {
    const anon = createAnonClient()
    const { error } = await anon.rpc('report_accounting_aggregates', {
      p_organization_id: fixture.organizationId,
      p_branch_id: null,
      p_business_unit_id: null,
      p_from: null,
      p_to: null,
    })

    expect(error).not.toBeNull()
  })
})
