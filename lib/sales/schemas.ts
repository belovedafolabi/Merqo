import { z } from 'zod'

/**
 * Shared client/server validation for this milestone's checkout/hold/return/
 * refund forms — same role as lib/inventory/schemas.ts. Every mutation in
 * lib/sales/mutations.ts parses its input against one of these before
 * touching the database; the DB's own CHECK constraints
 * (supabase/migrations/20260823120*.sql) are the last line of defense, not
 * the first. Amounts are never trusted from the client as final totals —
 * these schemas only validate *shape*; lib/sales/calculations.ts re-derives
 * every amount server-side from resolved prices and the Business Unit's own
 * POS config.
 */

const moneySchema = z.coerce.number().min(0, 'Amount cannot be negative.')
const quantitySchema = z.coerce.number().positive('Quantity must be greater than zero.')

const saleLineItemSchema = z.object({
  productId: z.uuid('Select a product.'),
  variantId: z.uuid().optional().nullable(),
  quantity: quantitySchema,
})
export type SaleLineItemInput = z.infer<typeof saleLineItemSchema>

export const createSaleInputSchema = z.object({
  branchId: z.uuid('Select a branch.'),
  businessUnitId: z.uuid('Select a business unit.'),
  // Optional because the common POS case is an anonymous walk-in
  // (supabase/migrations/20260823130600_alter_sales_add_customer_id.sql).
  // The one case that requires it — paying with store credit — is enforced
  // inside create_sale(), not here, so the requirement lives with the
  // balance it protects rather than being restated in three places.
  customerId: z.uuid().optional().nullable(),
  idempotencyKey: z.string().trim().min(1, 'A checkout attempt requires an idempotency key.'),
  items: z.array(saleLineItemSchema).min(1, 'Add at least one product to the cart.'),
  discountPercentage: z.coerce.number().min(0).max(100).optional(),
  discountAmount: moneySchema.optional(),
  discountReason: z
    .string()
    .trim()
    .max(500, 'Reason must be 500 characters or fewer.')
    .optional()
    .transform((value) => (value ? value : undefined)),
  paymentMethod: z.enum(['cash', 'card', 'transfer', 'store_credit']),
  paymentReference: z
    .string()
    .trim()
    .max(255)
    .optional()
    .transform((value) => (value ? value : undefined)),
})
export type CreateSaleInput = z.infer<typeof createSaleInputSchema>

export const holdSaleInputSchema = z.object({
  branchId: z.uuid('Select a branch.'),
  businessUnitId: z.uuid('Select a business unit.'),
  label: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => (value ? value : undefined)),
  items: z.array(saleLineItemSchema).min(1, 'A held sale needs at least one item.'),
})
export type HoldSaleInput = z.infer<typeof holdSaleInputSchema>

const returnLineItemSchema = z.object({
  saleItemId: z.uuid('Select a sold item.'),
  quantity: quantitySchema,
  reason: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => (value ? value : undefined)),
})
export type ReturnLineItemInput = z.infer<typeof returnLineItemSchema>

export const createReturnInputSchema = z.object({
  saleId: z.uuid('Select the original sale.'),
  reason: z.string().trim().min(1, 'A reason is required for a return.').max(500),
  items: z.array(returnLineItemSchema).min(1, 'Select at least one item to return.'),
})
export type CreateReturnInput = z.infer<typeof createReturnInputSchema>

export const requestRefundInputSchema = z.object({
  saleId: z.uuid('Select the original sale.'),
  returnId: z.uuid().optional().nullable(),
  amount: moneySchema.refine((value) => value > 0, 'Refund amount must be greater than zero.'),
  method: z.enum(['cash', 'card', 'transfer', 'store_credit']),
  reason: z.string().trim().min(1, 'A reason is required for a refund.').max(500),
})
export type RequestRefundInput = z.infer<typeof requestRefundInputSchema>

export const decideRefundInputSchema = z.object({
  refundId: z.uuid('Select a refund request.'),
  approved: z.coerce.boolean(),
})
export type DecideRefundInput = z.infer<typeof decideRefundInputSchema>
