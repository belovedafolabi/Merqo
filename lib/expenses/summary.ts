/**
 * The expense shape and the pure arithmetic over it — deliberately separate
 * from lib/expenses/queries.ts.
 *
 * The split is not stylistic. queries.ts imports createServerSupabaseClient,
 * which imports `next/headers`, which cannot exist in a client bundle. A
 * `'use client'` component importing a *value* from queries.ts therefore drags
 * the whole server module across the boundary and fails the build — which is
 * exactly what happened before this module existed. Types are erased at
 * compile time and cross freely; functions do not.
 *
 * Same reasoning that keeps lib/sales/calculations.ts and lib/customers/
 * ledger.ts free of database imports: pure logic that both sides need lives on
 * its own.
 */

export interface Expense {
  id: string
  branchId: string
  branchName: string
  businessUnitId: string | null
  category: string
  amount: number
  paymentMethod: string
  description: string | null
  expenseDate: string
  status: 'pending' | 'approved' | 'rejected'
  decisionReason: string | null
  decidedAt: string | null
  approvedByName: string | null
  voidedAt: string | null
  voidReason: string | null
  createdAt: string
  createdByName: string | null
}

export interface ExpenseTotals {
  pendingCount: number
  pendingAmount: number
  approvedAmount: number
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/**
 * The three figures the expenses screen puts above its table. Derived from the
 * same rows the table renders rather than from a separate aggregate query, so
 * the header and the list can never disagree about what is on screen.
 *
 * Voided expenses are excluded from every figure: they have been formally
 * withdrawn, and counting a withdrawn expense in "approved this period" would
 * make this header disagree with the accounting dashboard, which excludes them
 * too (lib/reports/accounting.ts).
 */
export function summarizeExpenses(expenses: readonly Expense[]): ExpenseTotals {
  const live = expenses.filter((expense) => expense.voidedAt === null)
  const pending = live.filter((expense) => expense.status === 'pending')

  const sum = (rows: readonly Expense[]) =>
    round2(rows.reduce((total, row) => total + row.amount, 0))

  return {
    pendingCount: pending.length,
    pendingAmount: sum(pending),
    approvedAmount: sum(live.filter((expense) => expense.status === 'approved')),
  }
}
