import { Suspense } from 'react'
import { Bell } from 'lucide-react'

import { NotificationBell } from '@/components/notifications/notification-bell'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

/**
 * Admin Dashboard topbar — page title + notification bell + an actions slot
 * for a page's primary pill CTA, per the reference design's "Dashboard …
 * 🔔 [Add Custom Widget]" bar. A page passes its own title/actions rather
 * than this component guessing them from the route, keeping the shell
 * generic for every later milestone's screen.
 *
 * The bell is a child async Server Component
 * (components/notifications/notification-bell.tsx), not inlined here and
 * not making THIS component async: every page in app/(app)/** renders its
 * own <AdminTopbar title="…">, so an async AdminTopbar would ripple into
 * every one of those call sites, and would break outright the moment any
 * page renders it from a Client Component. The <Suspense> boundary keeps
 * the unread-count query off the page shell's critical path — the fallback
 * is the same disabled-looking button the bell used to be before Milestone
 * 12 wired it up.
 */
export function AdminTopbar({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b px-4 sm:px-6">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-5" />
        <h1 className="text-h4 font-semibold tracking-tight">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        {children}
        <Suspense
          fallback={
            <Button variant="outline" size="icon" aria-label="Notifications" disabled>
              <Bell />
            </Button>
          }
        >
          <NotificationBell />
        </Suspense>
      </div>
    </header>
  )
}
