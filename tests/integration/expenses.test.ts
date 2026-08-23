import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

import { pool, withTransaction } from './helpers/db'

/**
 * The expense lifecycle: recorded -> decided -> (optionally) voided, and what
 * each state contributes to reported profit.
 *
 * The property under test throughout is that an expense is *append-only after
 * the decision*. Milestone 10's Definition of Done requires accounting figures
 * that reconcile against the transactional data, and a figure for a closed
 * period cannot reconcile with anything if the rows behind it can still be
 * edited. decide_expense()/void_expense() are the only mutation paths, and
 * they only ever add information.
 */

async function seedBranch(client: PoolClient) {
  const suffix = randomUUID().slice(0, 8)
  const businessType = await client.query(
    `select id from public.business_types where slug = 'supermarket'`,
  )
  const org = await client.query(
    `insert into public.organizations (name, slug) values ('Expense Org', $1) returning id`,
    [`expense-org-${suffix}`],
  )
  const branch = await client.query(
    `insert into public.branches (organization_id, name, slug) values ($1, 'Main', $2) returning id`,
    [org.rows[0].id, `expense-branch-${suffix}`],
  )
  const unit = await client.query(
    `insert into public.business_units (branch_id, business_type_id, name, slug)
     values ($1, $2, 'Unit', $3) returning id`,
    [branch.rows[0].id, businessType.rows[0].id, `expense-unit-${suffix}`],
  )

  return {
    organizationId: org.rows[0].id as string,
    branchId: branch.rows[0].id as string,
    businessUnitId: unit.rows[0].id as string,
  }
}

async function insertExpense(
  client: PoolClient,
  scope: { organizationId: string; branchId: string; businessUnitId: string },
  overrides: { category?: string; amount?: number; method?: string } = {},
) {
  const result = await client.query(
    `insert into public.expenses
       (organization_id, branch_id, business_unit_id, category, amount, payment_method, expense_date)
     values ($1, $2, $3, $4, $5, $6, current_date) returning *`,
    [
      scope.organizationId,
      scope.branchId,
      scope.businessUnitId,
      overrides.category ?? 'Electricity',
      overrides.amount ?? 50_000,
      overrides.method ?? 'cash',
    ],
  )
  return result.rows[0]
}

afterAll(async () => {
  await pool.end()
})

describe('recording an expense', () => {
  it('starts pending', async () => {
    await withTransaction(async (client) => {
      const scope = await seedBranch(client)
      const expense = await insertExpense(client, scope)

      expect(expense.status).toBe('pending')
      expect(expense.decided_at).toBeNull()
      expect(expense.voided_at).toBeNull()
    })
  })

  it('rejects a zero or negative amount', async () => {
    await withTransaction(async (client) => {
      const scope = await seedBranch(client)
      await expect(insertExpense(client, scope, { amount: 0 })).rejects.toThrow()
    })
  })

  it('rejects a payment method outside the allowed set', async () => {
    await withTransaction(async (client) => {
      const scope = await seedBranch(client)
      await expect(insertExpense(client, scope, { method: 'crypto' })).rejects.toThrow()
    })
  })

  it('allows a branch-wide expense with no business unit', async () => {
    // Rent and electricity are branch-wide. Forcing a Business Unit would push
    // operators into picking an arbitrary one and corrupt per-BU profit.
    await withTransaction(async (client) => {
      const scope = await seedBranch(client)
      const result = await client.query(
        `insert into public.expenses
           (organization_id, branch_id, category, amount, payment_method, expense_date)
         values ($1, $2, 'Rent', 250000, 'transfer', current_date) returning *`,
        [scope.organizationId, scope.branchId],
      )
      expect(result.rows[0].business_unit_id).toBeNull()
    })
  })
})

describe('decide_expense()', () => {
  it('approves a pending expense', async () => {
    await withTransaction(async (client) => {
      const scope = await seedBranch(client)
      const expense = await insertExpense(client, scope)

      const result = await client.query(`select * from public.decide_expense($1, true, null)`, [
        expense.id,
      ])

      expect(result.rows[0].status).toBe('approved')
      expect(result.rows[0].decided_at).not.toBeNull()
    })
  })

  it('rejects with a reason that stays on the row', async () => {
    await withTransaction(async (client) => {
      const scope = await seedBranch(client)
      const expense = await insertExpense(client, scope)

      const result = await client.query(
        `select * from public.decide_expense($1, false, 'no receipt attached')`,
        [expense.id],
      )

      expect(result.rows[0].status).toBe('rejected')
      expect(result.rows[0].decision_reason).toBe('no receipt attached')
    })
  })

  it('refuses to decide the same expense twice', async () => {
    // Re-deciding would let an approver flip an expense in and out of a
    // period's profit with only the latest state visible.
    await withTransaction(async (client) => {
      const scope = await seedBranch(client)
      const expense = await insertExpense(client, scope)

      await client.query(`select public.decide_expense($1, true, null)`, [expense.id])
      await expect(
        client.query(`select public.decide_expense($1, false, 'changed my mind')`, [expense.id]),
      ).rejects.toThrow(/already been decided/)
    })
  })

  it('refuses to decide a voided expense', async () => {
    await withTransaction(async (client) => {
      const scope = await seedBranch(client)
      const expense = await insertExpense(client, scope)

      await client.query(`select public.void_expense($1, 'duplicate entry')`, [expense.id])
      await expect(
        client.query(`select public.decide_expense($1, true, null)`, [expense.id]),
      ).rejects.toThrow(/has been voided/)
    })
  })

  it('raises on an unknown expense', async () => {
    await withTransaction(async (client) => {
      await expect(
        client.query(`select public.decide_expense($1, true, null)`, [randomUUID()]),
      ).rejects.toThrow(/unknown expense/)
    })
  })
})

describe('void_expense()', () => {
  it('preserves the row, its amount and the reason it was withdrawn', async () => {
    // A hard delete would change an already-reported net profit for a closed
    // period with nothing left to explain why.
    await withTransaction(async (client) => {
      const scope = await seedBranch(client)
      const expense = await insertExpense(client, scope, { amount: 75_000 })
      await client.query(`select public.decide_expense($1, true, null)`, [expense.id])

      const result = await client.query(`select * from public.void_expense($1, 'entered twice')`, [
        expense.id,
      ])

      expect(result.rows[0].voided_at).not.toBeNull()
      expect(result.rows[0].void_reason).toBe('entered twice')
      expect(Number(result.rows[0].amount)).toBe(75_000)
      // Status is untouched — the record still says it was approved, which is
      // the truth about what happened.
      expect(result.rows[0].status).toBe('approved')
    })
  })

  it('requires a reason', async () => {
    await withTransaction(async (client) => {
      const scope = await seedBranch(client)
      const expense = await insertExpense(client, scope)

      await expect(
        client.query(`select public.void_expense($1, '   ')`, [expense.id]),
      ).rejects.toThrow(/void reason is required/)
    })
  })

  it('refuses to void twice', async () => {
    await withTransaction(async (client) => {
      const scope = await seedBranch(client)
      const expense = await insertExpense(client, scope)

      await client.query(`select public.void_expense($1, 'first')`, [expense.id])
      await expect(
        client.query(`select public.void_expense($1, 'second')`, [expense.id]),
      ).rejects.toThrow(/already been voided/)
    })
  })
})

describe('what reaches reported profit', () => {
  it('counts an approved expense and nothing else', async () => {
    await withTransaction(async (client) => {
      const scope = await seedBranch(client)

      const approved = await insertExpense(client, scope, { category: 'A', amount: 1_000 })
      await insertExpense(client, scope, { category: 'B', amount: 2_000 })
      const rejected = await insertExpense(client, scope, { category: 'C', amount: 4_000 })
      const voided = await insertExpense(client, scope, { category: 'D', amount: 8_000 })

      await client.query(`select public.decide_expense($1, true, null)`, [approved.id])
      await client.query(`select public.decide_expense($1, false, 'not a business cost')`, [
        rejected.id,
      ])
      await client.query(`select public.decide_expense($1, true, null)`, [voided.id])
      await client.query(`select public.void_expense($1, 'duplicate')`, [voided.id])

      const result = await client.query(
        `select * from public.report_accounting_aggregates($1, null, null, null, null)`,
        [scope.organizationId],
      )

      // Only the ₦1,000. Pending is a claim, rejected was refused, voided was
      // withdrawn.
      expect(Number(result.rows[0].expenses_approved)).toBe(1_000)
      expect(Number(result.rows[0].expense_count)).toBe(1)
    })
  })

  it('removes an expense from profit when it is voided', async () => {
    await withTransaction(async (client) => {
      const scope = await seedBranch(client)
      const expense = await insertExpense(client, scope, { amount: 5_000 })
      await client.query(`select public.decide_expense($1, true, null)`, [expense.id])

      const before = await client.query(
        `select * from public.report_accounting_aggregates($1, null, null, null, null)`,
        [scope.organizationId],
      )
      expect(Number(before.rows[0].expenses_approved)).toBe(5_000)

      await client.query(`select public.void_expense($1, 'recorded in error')`, [expense.id])

      const after = await client.query(
        `select * from public.report_accounting_aggregates($1, null, null, null, null)`,
        [scope.organizationId],
      )
      expect(Number(after.rows[0].expenses_approved)).toBe(0)
    })
  })

  it('attributes an expense to its expense_date, not the date it was typed in', async () => {
    await withTransaction(async (client) => {
      const scope = await seedBranch(client)

      const backdated = await client.query(
        `insert into public.expenses
           (organization_id, branch_id, category, amount, payment_method, expense_date)
         values ($1, $2, 'Rent', 30000, 'transfer', current_date - 90) returning id`,
        [scope.organizationId, scope.branchId],
      )
      await client.query(`select public.decide_expense($1, true, null)`, [backdated.rows[0].id])

      const thisMonth = await client.query(
        `select * from public.report_accounting_aggregates($1, null, null, date_trunc('month', now()), now() + interval '1 day')`,
        [scope.organizationId],
      )
      expect(Number(thisMonth.rows[0].expenses_approved)).toBe(0)

      const wideWindow = await client.query(
        `select * from public.report_accounting_aggregates($1, null, null, now() - interval '120 days', now() + interval '1 day')`,
        [scope.organizationId],
      )
      expect(Number(wideWindow.rows[0].expenses_approved)).toBe(30_000)
    })
  })
})
