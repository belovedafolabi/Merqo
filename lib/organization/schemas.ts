import { z } from 'zod'

/**
 * Shared client/server validation for the organization profile screen — the
 * "ongoing organization-level configuration" Milestone 05 covered only at
 * onboarding time (docs/milestones/11-administration-employees-and-branding.md
 * Scope). Deliberately does not include `name`/`slug`: those are the
 * identity Milestone 05's onboarding wizard already establishes and
 * create_organization_with_owner() sets once; changing an organization's
 * legal/operational name is a bigger decision than this screen's scope
 * (receipts print `brand_name ?? name` — see lib/branding/queries.ts — so
 * `brand_name` is the field to change for a display-name update, and that
 * lives in the branding editor, not here).
 */
export const organizationProfileInputSchema = z.object({
  contactPhone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((value) => (value ? value : undefined)),
  contactEmail: z
    .email('Enter a valid email address.')
    .optional()
    .or(z.literal(''))
    .transform((value) => (value ? value : undefined)),
  addressLine: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => (value ? value : undefined)),
  // The organization-wide fallback low-stock threshold (20260904090000).
  // null = "no default"; a value must be a non-negative number. The action
  // does the string→number/null coercion from the form field, matching how
  // the fields above are pre-shaped to `string | undefined` before parse.
  defaultLowStockThreshold: z
    .number()
    .min(0, 'Enter zero or a positive number.')
    .max(1e11)
    .nullable(),
})
export type OrganizationProfileInput = z.infer<typeof organizationProfileInputSchema>
