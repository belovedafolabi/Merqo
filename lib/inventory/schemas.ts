import { z } from 'zod'

/**
 * Shared client/server validation for this milestone's adjustment/transfer/
 * threshold forms — same role as lib/products/schemas.ts. Every mutation in
 * lib/inventory/mutations.ts parses its input against one of these before
 * touching the database; the DB's own CHECK constraints
 * (supabase/migrations/20260823110*.sql) are the last line of defense, not
 * the first.
 */

const reasonSchema = z
  .string()
  .trim()
  .min(1, 'A reason is required for every stock adjustment.')
  .max(500, 'Reason must be 500 characters or fewer.')

const quantitySchema = z.coerce.number().positive('Quantity must be greater than zero.')

// Nonzero, either direction — an adjustment can add or remove stock. Unlike
// a transfer's quantity (always a positive amount moved), this is the
// signed delta record_inventory_movement() applies directly.
const quantityDeltaSchema = z.coerce
  .number()
  .refine((value) => value !== 0, 'Quantity change cannot be zero.')

export const stockAdjustmentInputSchema = z.object({
  branchId: z.uuid('Select a branch.'),
  productId: z.uuid('Select a product.'),
  variantId: z.uuid().optional().nullable(),
  quantityDelta: quantityDeltaSchema,
  reason: reasonSchema,
  // Only meaningful when the owning Business Unit has batch_tracking/
  // expiry_tracking enabled — components/inventory/stock-adjustment-dialog.tsx
  // only renders these fields in that case, same conditional-field shape as
  // products.costPrice's products.view_cost_price gating.
  batchNumber: z
    .string()
    .trim()
    .max(64, 'Batch number must be 64 characters or fewer.')
    .optional()
    .transform((value) => (value ? value : undefined)),
  expiryDate: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
})
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentInputSchema>

const stockTransferItemSchema = z.object({
  sourceProductId: z.uuid('Select the product to transfer.'),
  sourceVariantId: z.uuid().optional().nullable(),
  destinationProductId: z.uuid('Select the matching product at the destination branch.'),
  destinationVariantId: z.uuid().optional().nullable(),
  quantity: quantitySchema,
})
export type StockTransferItemInput = z.infer<typeof stockTransferItemSchema>

export const stockTransferInputSchema = z
  .object({
    sourceBranchId: z.uuid('Select a source branch.'),
    destinationBranchId: z.uuid('Select a destination branch.'),
    items: z.array(stockTransferItemSchema).min(1, 'Add at least one product to transfer.'),
  })
  .refine((value) => value.sourceBranchId !== value.destinationBranchId, {
    message: 'Source and destination branch must be different.',
    path: ['destinationBranchId'],
  })
export type StockTransferInput = z.infer<typeof stockTransferInputSchema>

export const lowStockThresholdInputSchema = z.object({
  threshold: z.coerce.number().min(0, 'Threshold cannot be negative.').nullable(),
})
export type LowStockThresholdInput = z.infer<typeof lowStockThresholdInputSchema>
