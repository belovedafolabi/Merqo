'use server'

import { revalidatePath } from 'next/cache'

import { createExpense, decideExpense, voidExpense } from '@/lib/expenses/mutations'

/**
 * Server Actions for the Expenses screen — same thin FormData-parsing shape as
 * app/(app)/inventory/actions.ts around lib/expenses/mutations.ts.
 */
export interface ExpenseActionState {
  error: string | null
}

const initialState: ExpenseActionState = { error: null }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function optionalStringField(formData: FormData, key: string): string | undefined {
  const value = formData.get(key)
  return value ? String(value) : undefined
}

/**
 * Both /expenses and /reports/accounting are revalidated after every write:
 * an approved expense changes reported net profit, and leaving the accounting
 * dashboard on a cached figure that no longer matches the expense list is the
 * kind of inconsistency that makes people distrust the numbers.
 */
function revalidateExpenseViews(): void {
  revalidatePath('/expenses')
  revalidatePath('/reports/accounting')
}

export async function createExpenseAction(
  _prevState: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')

  try {
    await createExpense(organizationId, {
      branchId: String(formData.get('branchId') ?? ''),
      businessUnitId: optionalStringField(formData, 'businessUnitId') ?? null,
      category: String(formData.get('category') ?? ''),
      amount: Number(formData.get('amount') ?? 0),
      paymentMethod: String(formData.get('paymentMethod') ?? 'cash') as
        'cash' | 'card' | 'transfer',
      description: optionalStringField(formData, 'description'),
      expenseDate: String(formData.get('expenseDate') ?? ''),
    })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidateExpenseViews()
  return initialState
}

export async function decideExpenseAction(
  _prevState: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const branchId = String(formData.get('branchId') ?? '')

  try {
    await decideExpense(organizationId, branchId, {
      expenseId: String(formData.get('expenseId') ?? ''),
      approved: formData.get('approved') === 'true',
      reason: optionalStringField(formData, 'reason'),
    })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidateExpenseViews()
  return initialState
}

export async function voidExpenseAction(
  _prevState: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const branchId = String(formData.get('branchId') ?? '')

  try {
    await voidExpense(organizationId, branchId, {
      expenseId: String(formData.get('expenseId') ?? ''),
      reason: String(formData.get('reason') ?? ''),
    })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidateExpenseViews()
  return initialState
}
