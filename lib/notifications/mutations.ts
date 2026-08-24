import { getCurrentUser } from '@/lib/auth/context'
import { createServerSupabaseClient } from '@/lib/supabase/server'

import {
  updateNotificationPreferenceInputSchema,
  type UpdateNotificationPreferenceInput,
} from './schemas'

/**
 * The only writes this domain exposes to a Server Action. No
 * requirePermission() call anywhere in this file — deliberate, not an
 * oversight. Every write here is scoped to the caller's own rows
 * (`user_id = auth.uid()`), enforced by RLS
 * (20260824100100_alter_notifications_add_policies.sql,
 * 20260824100300_alter_notification_preferences_add_policies.sql), not by a
 * permission key. There is no organizational resource being acted on here —
 * see the seed.sql 5h comment for the same reasoning applied to the
 * permission catalog.
 */

export async function markNotificationRead(notificationId: string): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .is('read_at', null)

  if (error) throw error
}

/**
 * Marks every unread notification in one organization as read, for the
 * caller only — the update's WHERE clause is themselves scoped, but RLS
 * (notifications_update_self) is the actual boundary regardless of what this
 * function's own filter says.
 */
export async function markAllNotificationsRead(organizationId: string): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .is('read_at', null)

  if (error) throw error
}

/**
 * Upserts one category's toggle. A mandatory category (security, billing)
 * that the caller tries to disable is rejected by
 * notification_preferences_update_self's WITH CHECK
 * (20260824100300) — this function does not pre-check that client-side; the
 * database's refusal surfaces as the thrown error, same as every other
 * mutation in this codebase.
 */
export async function updateNotificationPreference(
  rawInput: UpdateNotificationPreferenceInput,
): Promise<void> {
  const input = updateNotificationPreferenceInputSchema.parse(rawInput)
  const user = await getCurrentUser()
  if (!user) throw new Error('Not signed in.')

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.from('notification_preferences').upsert(
    {
      user_id: user.id,
      category: input.category,
      in_app_enabled: input.inAppEnabled,
      email_enabled: input.emailEnabled,
    },
    { onConflict: 'user_id,category' },
  )

  if (error) throw error
}
