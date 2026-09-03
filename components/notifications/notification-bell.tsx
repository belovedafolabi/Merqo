import { getCurrentOrganizationId } from '@/lib/auth/context'
import { getUnreadNotificationCount } from '@/lib/notifications/queries'
import { NotificationBellButton } from '@/components/notifications/notification-bell-button'

/**
 * The bell that was a stub in Milestone 04 ("wired to real content in
 * Milestone 12"), now wired. Async Server Component, rendered by
 * AdminTopbar behind a <Suspense> boundary — see that file's comment for
 * why it is a child component rather than making AdminTopbar itself async.
 *
 * Milestone 12 linked straight to /notifications; the bell now opens a
 * drawer instead (NotificationBellButton). This component's only remaining
 * job is the server-rendered unread count for the badge — the drawer's list
 * loads lazily on open. The /notifications page stays as a deep-link target.
 *
 * No Supabase Realtime: a low-stock or role-change alert is minutes-to-
 * hours latency tolerant, and a websocket per session is a cost this
 * project's stated $0–$10/month target does not justify. The honest
 * limitation — another user's bell does not update until their next
 * navigation — is unchanged by moving to a drawer.
 */
export async function NotificationBell() {
  const organizationId = await getCurrentOrganizationId()
  if (!organizationId) return null
  const unreadCount = await getUnreadNotificationCount(organizationId)

  return <NotificationBellButton unreadCount={unreadCount} organizationId={organizationId} />
}
