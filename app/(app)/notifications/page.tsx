import { redirect } from 'next/navigation'

import { requireUser } from '@/lib/auth/guard'
import { getCurrentOrganizationId } from '@/lib/auth/context'
import { listNotifications } from '@/lib/notifications/queries'
import { AdminTopbar } from '@/components/shell/admin-topbar'
import { NotificationList } from '@/components/notifications/notification-list'
import { MarkAllReadButton } from '@/components/notifications/mark-all-read-button'

const INBOX_LIMIT = 50

/**
 * The inbox the bell links to. No permission check beyond requireUser() —
 * every row is already scoped to the caller by RLS
 * (notifications_select_self), so there is no organizational resource to
 * gate here, same reasoning as lib/notifications/queries.ts's file header.
 */
export default async function NotificationsPage() {
  await requireUser()
  const organizationId = await getCurrentOrganizationId()
  if (!organizationId) redirect('/sign-in')

  const notifications = await listNotifications(organizationId, { limit: INBOX_LIMIT })
  const hasUnread = notifications.some((n) => n.readAt === null)

  return (
    <div className="flex flex-1 flex-col">
      <AdminTopbar title="Notifications">
        <MarkAllReadButton organizationId={organizationId} disabled={!hasUnread} />
      </AdminTopbar>
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <NotificationList notifications={notifications} />
        {notifications.length === INBOX_LIMIT && (
          <p className="text-body-sm text-muted-foreground">
            Showing the {INBOX_LIMIT} most recent notifications.
          </p>
        )}
      </div>
    </div>
  )
}
