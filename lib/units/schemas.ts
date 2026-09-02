import { z } from 'zod'

/**
 * Shared client/server validation for the unit-of-measure manager — same
 * role as lib/products/schemas.ts's categoryInputSchema. The DB's CHECK
 * constraints and partial-unique indexes (20260902090000) are the last line
 * of defense, not the first.
 */
export const unitInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required.')
    .max(40, 'Name must be 40 characters or fewer.'),
  abbreviation: z
    .string()
    .trim()
    .min(1, 'Abbreviation is required.')
    .max(12, 'Abbreviation must be 12 characters or fewer.'),
})
export type UnitInput = z.infer<typeof unitInputSchema>
