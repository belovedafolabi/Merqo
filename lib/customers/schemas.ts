import { z } from 'zod'

/**
 * Shared client/server validation for this milestone's customer, store-credit,
 * and layaway forms — same role as lib/sales/schemas.ts. Every mutation in
 * lib/customers/mutations.ts parses its input against one of these before
 * touching the database; the DB's own CHECK constraints and the ledger
 * functions' own guards (supabase/migrations/2026082313*.sql) are the last
 * line of defense, not the first.
 *
 * Amounts here validate *shape* only. The authoritative balance arithmetic —
 * whether a spend overdraws, whether an installment overpays — happens
 * inside record_store_credit_entry()/record_layaway_payment() under a row
 * lock, because it is the only place that can be correct under concurrent
 * access. Nothing in this file duplicates it.
 */

const moneySchema = z.coerce.number().positive('Amount must be greater than zero.')
const quantitySchema = z.coerce.number().positive('Quantity must be greater than zero.')

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer.`)
    .optional()
    .transform((value) => (value ? value : undefined))

export const customerInputSchema = z.object({
  name: z.string().trim().min(1, 'A customer needs a name.').max(160),
  // Deliberately permissive: Nigerian numbers are written locally, with a
  // country code, with spaces, and with leading zeros, and rejecting any of
  // those at the till costs a sale. Uniqueness per organization is enforced
  // by the database index, which is the constraint that actually matters
  // for identifying a returning customer.
  phone: optionalText(40),
  email: z
    .email('Enter a valid email address.')
    .optional()
    .or(z.literal(''))
    .transform((value) => (value ? value : undefined)),
  address: optionalText(500),
  notes: optionalText(1000),
})
export type CustomerInput = z.infer<typeof customerInputSchema>

export const issueStoreCreditInputSchema = z.object({
  customerId: z.uuid('Select a customer.'),
  amount: moneySchema,
  reason: z.string().trim().min(1, 'A reason is required when issuing store credit.').max(500),
})
export type IssueStoreCreditInput = z.infer<typeof issueStoreCreditInputSchema>

/**
 * An adjustment is the one entry type that may move a balance in either
 * direction with no originating sale or refund behind it, so `amount` is
 * signed here (and only here) and a reason is mandatory — see
 * supabase/seed.sql section 5e for why it carries its own permission.
 */
export const adjustStoreCreditInputSchema = z.object({
  customerId: z.uuid('Select a customer.'),
  amount: z.coerce.number().refine((value) => value !== 0, 'An adjustment cannot be zero.'),
  reason: z.string().trim().min(1, 'A reason is required for an adjustment.').max(500),
})
export type AdjustStoreCreditInput = z.infer<typeof adjustStoreCreditInputSchema>

const layawayLineItemSchema = z.object({
  productId: z.uuid('Select a product.'),
  variantId: z.uuid().optional().nullable(),
  quantity: quantitySchema,
})
export type LayawayLineItemInput = z.infer<typeof layawayLineItemSchema>

export const createLayawayInputSchema = z.object({
  customerId: z.uuid('Select a customer.'),
  branchId: z.uuid('Select a branch.'),
  businessUnitId: z.uuid('Select a business unit.'),
  items: z.array(layawayLineItemSchema).min(1, 'Add at least one product to the layaway.'),
})
export type CreateLayawayInput = z.infer<typeof createLayawayInputSchema>

export const recordLayawayPaymentInputSchema = z.object({
  layawayId: z.uuid('Select a layaway.'),
  amount: moneySchema,
  method: z.enum(['cash', 'card', 'transfer']),
  reference: optionalText(255),
})
export type RecordLayawayPaymentInput = z.infer<typeof recordLayawayPaymentInputSchema>

export const cancelLayawayInputSchema = z.object({
  layawayId: z.uuid('Select a layaway.'),
  reason: z.string().trim().min(1, 'A reason is required to cancel a layaway.').max(500),
})
export type CancelLayawayInput = z.infer<typeof cancelLayawayInputSchema>
