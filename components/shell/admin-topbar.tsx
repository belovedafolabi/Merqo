import { Bell } from 'lucide-react'

import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

/**
 * Admin Dashboard topbar — page title + notification bell (stub; wired to
 * real content in Milestone 12) + an actions slot for a page's primary pill
 * CTA, per the reference design's "Dashboard … 🔔 [Add Custom Widget]" bar.
 * A page passes its own title/actions rather than this component guessing
 * them from the route, keeping the shell generic for every later milestone's
 * screen.
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
        <Button variant="outline" size="icon" aria-label="Notifications">
          <Bell />
        </Button>
      </div>
    </header>
  )
}
