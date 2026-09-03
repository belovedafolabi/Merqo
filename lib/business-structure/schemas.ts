import { z } from 'zod'

/**
 * Shared client/server validation for this milestone's Branch/Business
 * Unit/POS-config forms (docs/milestones/05-business-structure-and-onboarding.md
 * Technical Requirements: "Form validation with Zod schemas shared between
 * client-side form feedback and server-side enforcement — never trust
 * client validation alone"). Every Server Action in
 * app/(app)/business-structure/actions.ts parses its input against one of
 * these before touching the database; the same schema drives the onBlur
 * client-side checks in the corresponding form component.
 */

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required.')
  .max(120, 'Name must be 120 characters or fewer.')

// `.optional()` last (no `.transform`) so the KEY is optional in the inferred
// type — callers that don't set an address, e.g. the onboarding wizard's
// branch step, pass `{ name }` and still type-check. A submitted-but-empty
// value arrives as '' and is normalised to null by the mutation.
const optionalText = (max: number, message: string) =>
  z.string().trim().max(max, message).optional()

export const branchInputSchema = z.object({
  name: nameSchema,
  // Printed on this branch's receipts beneath the business name
  // (20260903090200). Optional — a single-shop business leaves these blank
  // and the receipt falls back to the organization's address/phone.
  addressLine: optionalText(500, 'Address must be 500 characters or fewer.'),
  contactPhone: optionalText(32, 'Phone number must be 32 characters or fewer.'),
})
export type BranchInput = z.infer<typeof branchInputSchema>

export const businessUnitInputSchema = z.object({
  branchId: z.uuid('Select a branch.'),
  businessTypeId: z.uuid('Select a business type.'),
  name: nameSchema,
})
export type BusinessUnitInput = z.infer<typeof businessUnitInputSchema>

export const capabilityOverrideInputSchema = z.object({
  capabilityId: z.uuid(),
  enabled: z.boolean(),
})
export type CapabilityOverrideInput = z.infer<typeof capabilityOverrideInputSchema>

export const capabilityOverridesInputSchema = z.array(capabilityOverrideInputSchema).min(1)

const percentage = (message: string) => z.coerce.number().min(0, message).max(100, message)

/**
 * Discount/tax/service-charge bounds per this milestone's Functional
 * Requirements ("tax/service-charge percentages within sane bounds, discount
 * limits are non-negative and internally consistent"). The
 * `service_charge_value <= 100` and `discount_max_amount >= 0` rules mirror
 * the database CHECK constraints in
 * supabase/migrations/20260823090100_create_business_unit_pos_config.sql —
 * this schema is the client/server-shared *first* line of defense, the DB
 * constraint is the last one; neither supersedes the other.
 */
export const posConfigInputSchema = z
  .object({
    taxRate: percentage('Tax rate must be between 0 and 100.'),
    serviceChargeEnabled: z.boolean(),
    serviceChargeType: z.enum(['percentage', 'fixed']),
    serviceChargeValue: z.coerce.number().min(0, 'Service charge cannot be negative.'),
    discountRequiresAuthorization: z.boolean(),
    discountMaxPercentage: percentage('Max discount percentage must be between 0 and 100.'),
    discountMaxAmount: z.coerce
      .number()
      .min(0, 'Max discount amount cannot be negative.')
      .nullable(),
    discountReasonRequired: z.boolean(),
    defaultPaymentMethod: z.enum(['cash', 'card', 'transfer']),
  })
  .refine((value) => value.serviceChargeType === 'fixed' || value.serviceChargeValue <= 100, {
    message: 'A percentage service charge cannot exceed 100.',
    path: ['serviceChargeValue'],
  })
export type PosConfigInput = z.infer<typeof posConfigInputSchema>
