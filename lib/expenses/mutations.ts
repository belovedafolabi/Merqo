import { recordAuditEvent } from '@/lib/auth/audit'
import { requirePermission } from '@/lib/auth/guard'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  decideExpenseInputSchema,
  expenseInputSchema,
  voidExpenseInputSchema,
  type DecideExpenseInput,
  type ExpenseInput,
  type VoidExpenseInput,
} from '@/lib/expenses/schemas'

/**
 * Expense writes.
 *
 * Same division of responsibility as every write path since Milestone 07: the
 * requirePermission() calls here are the authorization gate, and the SECURITY
 * DEFINER functions (20260823140200) perform the state transitions without
 * re-checking. The database's contribution is structural rather than
 * conditional — `authenticated` holds no UPDATE or DELETE grant on `expenses`
 * (20260823141200), so these three functions are the complete set of ways an
 * expense can change after it is recorded.
 *
 * Note that recording and deciding are separate permissions on purpose:
 * docs/PRD.md §27's "a cashier should not automatically have the ability to
 * create a ₦500,000 expense", and the corollary that whoever records one
 * should not be the one who approves it.
 */

export async function createExpense(
  organizationId: string,
  rawInput: ExpenseInput,
): Promise<string> {
  const input = expenseInputSchema.parse(rawInput)
  const user = await requirePermission('expense.create', {
    organizationId,
    branchId: input.branchId,
    ...(input.businessUnitId ? { businessUnitId: input.businessUnitId } : {}),
  })

  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('expenses')
    .insert({
      organization_id: organizationId,
      branch_id: input.branchId,
      business_unit_id: input.businessUnitId,
      category: input.category,
      amount: input.amount,
      payment_method: input.paymentMethod,
      description: input.description ?? null,
      expense_date: input.expenseDate,
      // Set explicitly rather than defaulted, because expenses_insert's WITH
      // CHECK requires it to equal auth.uid() — the database refusing an
      // expense attributed to someone else.
      created_by: user.id,
    })
    .select('id')
    .single<{ id: string }>()

  if (error) throw error

  await recordAuditEvent({
    organizationId,
    userId: user.id,
    action: 'expense.created',
    resourceType: 'expense',
    resourceId: data.id,
    metadata: {
      category: input.category,
      amount: input.amount,
      branchId: input.branchId,
      expenseDate: input.expenseDate,
    },
  })

  return data.id
}

export async function decideExpense(
  organizationId: string,
  branchId: string,
  rawInput: DecideExpenseInput,
): Promise<void> {
  const input = decideExpenseInputSchema.parse(rawInput)
  const user = await requirePermission('expense.approve', { organizationId, branchId })

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.rpc('decide_expense', {
    p_expense_id: input.expenseId,
    p_approved: input.approved,
    p_reason: input.reason ?? null,
  })

  if (error) throw error

  await recordAuditEvent({
    organizationId,
    userId: user.id,
    action: input.approved ? 'expense.approved' : 'expense.rejected',
    resourceType: 'expense',
    resourceId: input.expenseId,
    metadata: { reason: input.reason ?? null },
  })
}

/**
 * The `expense.delete` permission's action. Soft, always — see
 * void_expense()'s own comment for why an approved expense that already sits
 * inside a published net-profit figure must not simply disappear.
 */
export async function voidExpense(
  organizationId: string,
  branchId: string,
  rawInput: VoidExpenseInput,
): Promise<void> {
  const input = voidExpenseInputSchema.parse(rawInput)
  const user = await requirePermission('expense.delete', { organizationId, branchId })

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.rpc('void_expense', {
    p_expense_id: input.expenseId,
    p_reason: input.reason,
  })

  if (error) throw error

  await recordAuditEvent({
    organizationId,
    userId: user.id,
    action: 'expense.voided',
    resourceType: 'expense',
    resourceId: input.expenseId,
    metadata: { reason: input.reason },
  })
}
