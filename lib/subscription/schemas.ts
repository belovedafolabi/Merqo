import { z } from 'zod'

/**
 * Shared validation for pricing configuration and checkout initiation.
 * lib/subscription/mutations.ts parses against these before touching the
 * database; the RLS/RPC permission checks in 20260825100600/100800 are the
 * last line, not the first — same convention lib/roles/schemas.ts states.
 */

export const billingPeriodSchema = z.enum(['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL'])

export const setPriceInputSchema = z.object({
  billingPeriod: billingPeriodSchema,
  // Major units (e.g. Naira) as entered in the form — converted to minor
  // units (kobo) in lib/subscription/mutations.ts via toMinorUnits(), never
  // trusted as minor units from the client.
  priceMajor: z.number().nonnegative().finite(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO code.'),
})
export type SetPriceInput = z.infer<typeof setPriceInputSchema>

export const initiateCheckoutInputSchema = z.object({
  billingPeriod: billingPeriodSchema,
})
export type InitiateCheckoutInput = z.infer<typeof initiateCheckoutInputSchema>

export const confirmPaymentInputSchema = z.object({
  reference: z.string().trim().min(1, 'Missing payment reference.'),
})
export type ConfirmPaymentInput = z.infer<typeof confirmPaymentInputSchema>
