import { requireUser } from '@/lib/auth/guard'
import { getNotificationPreferences } from '@/lib/notifications/queries'
import { NotificationPreferencesForm } from '@/components/notifications/notification-preferences-form'

/**
 * No requirePermission() call — a user's own notification preferences are
 * not an organizational resource; RLS (notification_preferences_select_self
 * / _update_self) is the entire boundary, same reasoning as
 * lib/notifications/mutations.ts's file header and the seed.sql 5h comment.
 */
export default async function NotificationSettingsPage() {
  await requireUser()

  const preferences = await getNotificationPreferences()

  return <NotificationPreferencesForm preferences={preferences} />
}
