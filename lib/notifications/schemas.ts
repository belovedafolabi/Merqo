import { z } from 'zod'

/**
 * Validation for the one write the notifications domain exposes to a form:
 * updating one category's in-app/email toggle. lib/notifications/mutations.ts
 * parses against this before writing; the RLS UPDATE policy in
 * 20260824100300_alter_notification_preferences_add_policies.sql is the last
 * line, not the first — it is what actually refuses to disable a mandatory
 * category, this schema only shapes the input.
 */

export const updateNotificationPreferenceInputSchema = z.object({
  category: z.enum(['inventory', 'administration', 'security', 'billing']),
  inAppEnabled: z.boolean(),
  emailEnabled: z.boolean(),
})
export type UpdateNotificationPreferenceInput = z.infer<
  typeof updateNotificationPreferenceInputSchema
>
