import { z } from 'zod'

/**
 * Shared client/server validation for expense recording and approval — same
 * role as lib/customers/schemas.ts. lib/expenses/mutations.ts parses against
 * these before touching the database; the table's own CHECK constraints and
 * decide_expense()/void_expense()'s guards
 * (supabase/migrations/2026082314*.sql) are the last line, not the first.
 */

/**
 * A free-text category rather than a fixed enum.
 * docs/Financial_Architecture_Accounting_Reconciliation.md §26's examples
 * ("Electricity", "Transportation", "Maintenance") are illustrative, and every
 * business's expense categories differ — a hard-coded list would force
 * operators to file rent under "Other" within a week. The trade-off is
 * accepted deliberately: category is a grouping dimension in the expense
 * report, so inconsistent spelling fragments a group. A managed category list
 * belongs with Milestone 11's administration scope if it proves necessary.
 */
const categorySchema = z
  .string()
  .trim()
  .min(1, 'Give the expense a category.')
  .max(80, 'Category must be 80 characters or fewer.')

export const expenseInputSchema = z.object({
  branchId: z.uuid('Select a branch.'),
  // Nullable: rent and electricity are branch-wide and have no meaningful
  // Business Unit. See the table's own comment.
  businessUnitId: z
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
  category: categorySchema,
  amount: z.coerce.number().positive('Amount must be greater than zero.'),
  paymentMethod: z.enum(['cash', 'card', 'transfer']),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => (value ? value : undefined)),
  // A date rather than a timestamp: an expense belongs to a day for reporting
  // purposes, and the minute it was typed into the system is not interesting.
  expenseDate: z.iso.date('Enter a valid date.'),
})
export type ExpenseInput = z.infer<typeof expenseInputSchema>

export const decideExpenseInputSchema = z
  .object({
    expenseId: z.uuid('Select an expense.'),
    approved: z.boolean(),
    reason: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((value) => (value ? value : undefined)),
  })
  .superRefine((value, ctx) => {
    // A rejection without a reason leaves whoever recorded the expense with no
    // idea what to fix. An approval needs no justification.
    if (!value.approved && !value.reason) {
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'Give a reason when rejecting an expense.',
      })
    }
  })
export type DecideExpenseInput = z.infer<typeof decideExpenseInputSchema>

/**
 * Voiding always requires a reason — it is the one action that moves reported
 * profit with no originating business event behind it, which is why it carries
 * its own permission and why void_expense() enforces the same rule in SQL.
 */
export const voidExpenseInputSchema = z.object({
  expenseId: z.uuid('Select an expense.'),
  reason: z.string().trim().min(1, 'A reason is required to void an expense.').max(500),
})
export type VoidExpenseInput = z.infer<typeof voidExpenseInputSchema>
