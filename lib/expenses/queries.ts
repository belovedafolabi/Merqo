import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Read-side queries for expenses. Same shape as lib/sales/queries.ts — RLS
 * (`expenses_select`, 20260823140300) is the enforced visibility boundary;
 * these functions exist for query precision and row mapping, not as a second
 * authorization layer.
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

interface ExpenseRow {
  id: string
  branch_id: string
  business_unit_id: string | null
  category: string
  amount: string | number
  payment_method: string
  description: string | null
  expense_date: string
  status: string
  decision_reason: string | null
  decided_at: string | null
  voided_at: string | null
  void_reason: string | null
  created_at: string
  branches: { name: string } | null
  approver: { full_name: string } | null
  creator: { full_name: string } | null
}

/**
 * Both user joins are disambiguated with an explicit foreign-key hint
 * (`approver:users!expenses_approved_by_fkey`). Without it PostgREST cannot
 * tell which of the two `users` foreign keys on this table each embed refers
 * to and rejects the query outright — the standard shape for a table with two
 * references to the same parent.
 */
const SELECT_COLUMNS = `
  id, branch_id, business_unit_id, category, amount, payment_method, description,
  expense_date, status, decision_reason, decided_at, voided_at, void_reason, created_at,
  branches(name),
  approver:users!expenses_approved_by_fkey(full_name),
  creator:users!expenses_created_by_fkey(full_name)
`

function mapExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    branchId: row.branch_id,
    branchName: row.branches?.name ?? 'Unknown branch',
    businessUnitId: row.business_unit_id,
    category: row.category,
    amount: Number(row.amount),
    paymentMethod: row.payment_method,
    description: row.description,
    expenseDate: row.expense_date,
    status: row.status as Expense['status'],
    decisionReason: row.decision_reason,
    decidedAt: row.decided_at,
    approvedByName: row.approver?.full_name ?? null,
    voidedAt: row.voided_at,
    voidReason: row.void_reason,
    createdAt: row.created_at,
    createdByName: row.creator?.full_name ?? null,
  }
}

export interface ListExpensesOptions {
  branchId?: string | null
  status?: 'pending' | 'approved' | 'rejected' | null
  /** Voided expenses are hidden by default — they have been withdrawn. */
  includeVoided?: boolean
  limit?: number
}

export async function listExpenses(
  organizationId: string,
  options: ListExpensesOptions = {},
): Promise<Expense[]> {
  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('expenses')
    .select(SELECT_COLUMNS)
    .eq('organization_id', organizationId)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 200)

  if (options.branchId) query = query.eq('branch_id', options.branchId)
  if (options.status) query = query.eq('status', options.status)
  if (!options.includeVoided) query = query.is('voided_at', null)

  const { data, error } = await query
  if (error) throw error

  return ((data ?? []) as unknown as ExpenseRow[]).map(mapExpense)
}

export interface ExpenseTotals {
  pendingCount: number
  pendingAmount: number
  approvedAmount: number
}

/**
 * The three figures the expenses screen puts above the table. Derived from the
 * same rows the table shows rather than from a separate aggregate query, so
 * the header and the list can never disagree about what is on screen.
 */
export function summarizeExpenses(expenses: readonly Expense[]): ExpenseTotals {
  const live = expenses.filter((expense) => expense.voidedAt === null)
  const pending = live.filter((expense) => expense.status === 'pending')

  const sum = (rows: readonly Expense[]) =>
    Math.round((rows.reduce((total, row) => total + row.amount, 0) + Number.EPSILON) * 100) / 100

  return {
    pendingCount: pending.length,
    pendingAmount: sum(pending),
    approvedAmount: sum(live.filter((expense) => expense.status === 'approved')),
  }
}
