import { z } from 'zod'

/**
 * Shared client/server validation for a coupon. The table's own CHECK
 * constraints (20260904090300) are the last line — a blank code, a
 * percentage over 100, an end date before the start — this is the first,
 * friendly one. The Settings action pre-shapes the form fields to these
 * types (numbers as numbers, empty strings as null) before calling the
 * mutation, matching the convention in app/(app)/settings/pricing/actions.ts.
 */
export const couponInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, 'Enter a coupon code.')
      .max(40, 'Keep the code to 40 characters or fewer.')
      .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, hyphens and underscores only.')
      .transform((value) => value.toUpperCase()),
    discountType: z.enum(['percentage', 'fixed']),
    discountValue: z.number().positive('Enter a value above zero.'),
    minimumPurchase: z.number().min(0, 'A minimum purchase cannot be negative.'),
    maxRedemptions: z
      .number()
      .int('Enter a whole number.')
      .positive('Enter a value above zero.')
      .nullable(),
    /** A plain calendar date (YYYY-MM-DD) or null. */
    startsAt: z.string().min(1).nullable(),
    /** A plain calendar date (YYYY-MM-DD) or null — the last day the coupon is valid. */
    expiresAt: z.string().min(1).nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.discountType === 'percentage' && value.discountValue > 100) {
      ctx.addIssue({
        code: 'custom',
        path: ['discountValue'],
        message: 'A percentage discount cannot exceed 100.',
      })
    }
    if (value.startsAt && value.expiresAt && value.expiresAt < value.startsAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: 'The end date must be on or after the start date.',
      })
    }
  })

export type CouponInput = z.infer<typeof couponInputSchema>
