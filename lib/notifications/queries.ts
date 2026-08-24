import { createServerSupabaseClient } from '@/lib/supabase/server'

import { NOTIFICATION_CATEGORIES, type NotificationCategory } from './types'

/**
 * Read-side queries for the in-app inbox and preferences screen. RLS
 * (notifications_select_self / notification_preferences_select_self) is the
 * enforced visibility boundary — every query here already runs as the
 * signed-in caller via the anon-key server client, so there is no
 * requirePermission() call in this file; `user_id = auth.uid()` in the
 * database is the entire authorization rule (see the seed.sql 5h comment).
 */

export interface NotificationSummary {
  id: string
  category: NotificationCategory
  type: string
  title: string
  message: string
  href: string | null
  readAt: string | null
  createdAt: string
}

interface NotificationRow {
  id: string
  category: string
  type: string
  title: string
  message: string
  href: string | null
  read_at: string | null
  created_at: string
}

function mapNotificationRow(row: NotificationRow): NotificationSummary {
  return {
    id: row.id,
    category: row.category as NotificationCategory,
    type: row.type,
    title: row.title,
    message: row.message,
    href: row.href,
    readAt: row.read_at,
    createdAt: row.created_at,
  }
}

/**
 * The bell's badge count. Served by notifications_user_unread_idx
 * (20260824100000), a partial index on exactly this predicate.
 */
export async function getUnreadNotificationCount(organizationId: string): Promise<number> {
  const supabase = await createServerSupabaseClient()
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .is('read_at', null)

  if (error) throw error
  return count ?? 0
}

/**
 * The inbox list. Capped at 50 — no pagination primitive exists anywhere in
 * this app yet (components/ui/pagination.tsx is unused), and with a 24-hour
 * dedupe cooldown across three event types a busy org produces single-digit
 * notifications a day, so 50 is weeks of history. app/(app)/notifications/
 * page.tsx renders a "showing the 50 most recent" note when the cap binds,
 * so truncation is stated rather than silent.
 */
export async function listNotifications(
  organizationId: string,
  opts: { limit?: number } = {},
): Promise<NotificationSummary[]> {
  const limit = opts.limit ?? 50
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('notifications')
    .select('id, category, type, title, message, href, read_at, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return ((data ?? []) as NotificationRow[]).map(mapNotificationRow)
}

export interface NotificationPreference {
  category: NotificationCategory
  label: string
  description: string
  mandatory: boolean
  inAppEnabled: boolean
  emailEnabled: boolean
}

interface PreferenceRow {
  category: string
  in_app_enabled: boolean
  email_enabled: boolean
}

/**
 * One row per category, always — even for a user with zero
 * notification_preferences rows. A missing row means "use this category's
 * default", per 20260824100200's lazy-creation design; this is the merge
 * that makes that true for the read path, mirroring what
 * resolve_notification_recipients() already does in SQL for the write path.
 */
export async function getNotificationPreferences(): Promise<NotificationPreference[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('category, in_app_enabled, email_enabled')

  if (error) throw error

  const saved = new Map(
    ((data ?? []) as PreferenceRow[]).map((row) => [row.category, row]),
  )

  return (Object.entries(NOTIFICATION_CATEGORIES) as [NotificationCategory, (typeof NOTIFICATION_CATEGORIES)[NotificationCategory]][]).map(
    ([category, definition]) => {
      const row = saved.get(category)
      return {
        category,
        label: definition.label,
        description: definition.description,
        mandatory: definition.mandatory,
        inAppEnabled: row ? row.in_app_enabled : definition.defaults.inApp,
        emailEnabled: row ? row.email_enabled : definition.defaults.email,
      }
    },
  )
}
