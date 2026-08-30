import { z } from 'zod'

/**
 * Validation for the one write the notifications domain exposes to a form:
 * updating one category's in-app/email toggle. lib/notifications/mutations.ts
 * parses against this before writing; the RLS UPDATE policy in
 * 20260824100300_alter_notification_preferences_add_policies.sql is the last
 * line, not the first — it is what actually refuses to disable a mandatory
 * category, this schema only shapes the input.
 */

/**
 * Milestone 15 audit finding 3: markNotificationRead()/markAllNotificationsRead()
 * were the only mutations in the app taking an id straight from FormData with
 * no validation at all. RLS was — and remains — the security boundary, so this
 * is not a hole an attacker reads data through; the practical problem is that
 * an unvalidated string reaches PostgREST and comes back as a raw
 * `invalid input syntax for type uuid` error, which the action then surfaces
 * verbatim to the user.
 *
 * Validating here rather than in the action keeps the rule with the domain,
 * so a second caller cannot skip it.
 */
export const notificationIdSchema = z.uuid()

export const organizationIdSchema = z.uuid()

export const updateNotificationPreferenceInputSchema = z.object({
  category: z.enum(['inventory', 'administration', 'security', 'billing']),
  inAppEnabled: z.boolean(),
  emailEnabled: z.boolean(),
})
export type UpdateNotificationPreferenceInput = z.infer<
  typeof updateNotificationPreferenceInputSchema
>
