import Link from 'next/link'
import { Bell } from 'lucide-react'

import { getCurrentOrganizationId } from '@/lib/auth/context'
import { getUnreadNotificationCount } from '@/lib/notifications/queries'
import { Button } from '@/components/ui/button'

/**
 * The bell that was a stub in Milestone 04 ("wired to real content in
 * Milestone 12"), now wired. Async Server Component, rendered by
 * AdminTopbar behind a <Suspense> boundary — see that file's comment for
 * why it is a child component rather than making AdminTopbar itself async
 * (every page renders its own <AdminTopbar title="…">, so an async
 * AdminTopbar would force every one of those call sites to change, and
 * would break the moment any of them render it from a Client Component).
 *
 * Links to the inbox rather than opening a popover — a link is
 * deep-linkable, works without JS, and reuses DataTable for the list instead
 * of a second, bespoke rendering path. Popover-on-click is a defensible
 * upgrade later; it is not this milestone's scope.
 *
 * No Supabase Realtime: a low-stock or role-change alert is minutes-to-
 * hours latency tolerant, and a websocket per session is a cost this
 * project's stated $0–$10/month target does not justify for that. The
 * honest limitation this creates — another user's bell does not update
 * until their next navigation — is documented here rather than discovered
 * as a bug: revalidatePath('/', 'layout') (app/(app)/notifications/
 * actions.ts) only ever refreshes the CURRENT user's own view.
 */
export async function NotificationBell() {
  const organizationId = await getCurrentOrganizationId()
  const unreadCount = organizationId ? await getUnreadNotificationCount(organizationId) : 0
  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'

  return (
    <Button asChild variant="outline" size="icon" aria-label={label} className="relative">
      <Link href="/notifications">
        <Bell />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Link>
    </Button>
  )
}
