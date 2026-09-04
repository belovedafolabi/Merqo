import { z } from 'zod'

/**
 * Shared client/server validation for this milestone's Product/Category/
 * Variant/pricing forms — same role as
 * lib/business-structure/schemas.ts (docs/milestones/
 * 06-product-catalog-and-pricing.md Technical Requirements: form validation
 * shared between client-side feedback and server-side enforcement). Every
 * mutation in lib/products/mutations.ts parses its input against one of
 * these before touching the database; the DB's own CHECK constraints
 * (supabase/migrations/20260823100100_create_products.sql et al.) are the
 * last line of defense, not the first.
 */

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required.')
  .max(120, 'Name must be 120 characters or fewer.')

const optionalCode = z
  .string()
  .trim()
  .max(64, 'Must be 64 characters or fewer.')
  .optional()
  .transform((value) => (value ? value : undefined))

const money = (message: string) => z.coerce.number().min(0, message)

export const categoryInputSchema = z.object({
  name: nameSchema,
  description: z
    .string()
    .trim()
    .max(500, 'Description must be 500 characters or fewer.')
    .optional()
    .transform((value) => (value ? value : undefined)),
})
export type CategoryInput = z.infer<typeof categoryInputSchema>

export const productInputSchema = z.object({
  categoryId: z.uuid().optional().nullable(),
  name: nameSchema,
  description: z
    .string()
    .trim()
    .max(2000, 'Description must be 2000 characters or fewer.')
    .optional()
    .transform((value) => (value ? value : undefined)),
  // Optional: products.sku is NOT NULL, but a blank field is filled in
  // server-side by generateSku() (lib/products/sku.ts) at create time, and
  // left untouched on update. undefined here means "auto-generate".
  sku: z
    .string()
    .trim()
    .max(64, 'SKU must be 64 characters or fewer.')
    .optional()
    .transform((value) => (value ? value : undefined)),
  barcode: optionalCode,
  unitOfMeasurement: z
    .string()
    .trim()
    .min(1, 'Unit of measurement is required.')
    .max(32, 'Must be 32 characters or fewer.')
    .default('unit'),
  // Optional: absent entirely (not merely zero) when the caller lacks
  // `products.view_cost_price` and the form never rendered the field — see
  // lib/products/mutations.ts's updateProduct(), which leaves the existing
  // cost_price column untouched rather than defaulting a hidden field to 0.
  costPrice: money('Cost price cannot be negative.').optional(),
  basePrice: money('Base price cannot be negative.'),
  // Milestone 17 Part B: false marks a non-stock service line item. Optional
  // and defaulted so every existing caller and every non-service product is
  // unchanged (the DB column also defaults true).
  trackInventory: z.boolean().optional(),
})
export type ProductInput = z.infer<typeof productInputSchema>

/**
 * Opening stock, set on the create form so a new product does not have to be
 * created and then separately stocked on the Inventory screen. Absent (not
 * zero) when the field was not rendered — it is gated on `inventory.adjust`,
 * which the product's creator does not necessarily hold. Zero and blank both
 * mean "no opening movement"; the actual stock write goes through
 * createStockAdjustment(), so its own rules and audit trail apply unchanged.
 */
export const openingStockSchema = z.coerce
  .number()
  .min(0, 'Opening stock cannot be negative.')
  .optional()

export const productVariantInputSchema = z.object({
  name: nameSchema,
  sku: optionalCode,
  barcode: optionalCode,
  costPrice: z.coerce.number().min(0, 'Cost price cannot be negative.').optional().nullable(),
  basePrice: z.coerce.number().min(0, 'Base price cannot be negative.').optional().nullable(),
})
export type ProductVariantInput = z.infer<typeof productVariantInputSchema>

export const branchPriceOverrideInputSchema = z.object({
  branchId: z.uuid('Select a branch.'),
  price: money('Price cannot be negative.'),
})
export type BranchPriceOverrideInput = z.infer<typeof branchPriceOverrideInputSchema>
