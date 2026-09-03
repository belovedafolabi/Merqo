'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'

import { getNotificationsAction } from '@/app/(app)/notifications/actions'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { NotificationList } from '@/components/notifications/notification-list'
import { MarkAllReadButton } from '@/components/notifications/mark-all-read-button'
import { useIsMobile } from '@/hooks/use-mobile'
import type { NotificationSummary } from '@/lib/notifications/queries'

/**
 * The bell now opens a drawer instead of navigating to /notifications — a
 * side sheet on desktop, a bottom sheet on mobile. The inbox page stays as a
 * deep-link target (the drawer footer links to it), so notification `href`s
 * and shared links keep working.
 *
 * The list loads on first open through a Server Action, not up front: the
 * bell renders on every app page and most opens never happen.
 */
export function NotificationBellButton({
  unreadCount,
  organizationId,
}: {
  unreadCount: number
  organizationId: string
}) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationSummary[] | null>(null)
  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'

  useEffect(() => {
    if (!open || notifications !== null) return
    getNotificationsAction()
      .then(setNotifications)
      .catch(() => setNotifications([]))
  }, [open, notifications])

  // The badge count comes from the server render, but if the user marks
  // things read inside the drawer the freshest truth is what the list holds.
  const drawerUnread =
    notifications === null ? unreadCount : notifications.filter((n) => n.readAt === null).length

  return (
    <Drawer open={open} onOpenChange={setOpen} direction={isMobile ? 'bottom' : 'right'}>
      <Button
        variant="outline"
        size="icon"
        aria-label={label}
        className="relative"
        onClick={() => setOpen(true)}
      >
        <Bell />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>

      <DrawerContent className="data-[vaul-drawer-direction=right]:sm:max-w-md">
        <DrawerHeader className="flex-row items-center justify-between gap-2">
          <DrawerTitle>Notifications</DrawerTitle>
          <MarkAllReadButton organizationId={organizationId} disabled={drawerUnread === 0} />
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto scroll-smooth px-4">
          {notifications === null ? (
            <p className="py-6 text-center text-body-sm text-muted-foreground">Loading…</p>
          ) : (
            <NotificationList notifications={notifications} />
          )}
        </div>

        <div className="border-t p-4 pb-safe-b">
          <DrawerClose asChild>
            <Button asChild variant="outline" className="w-full">
              <Link href="/notifications">Open notifications page</Link>
            </Button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
