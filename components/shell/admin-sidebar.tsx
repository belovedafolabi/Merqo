import Link from 'next/link'
import { Bolt } from 'lucide-react'

import { signOut } from '@/app/(auth)/actions'
import { primaryNavItems, secondaryNavItems } from '@/lib/shell/nav-items'
import { NavList } from '@/components/shell/nav-list'
import { BusinessUnitSwitcher } from '@/components/shell/business-unit-switcher'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

/**
 * Admin Dashboard sidebar — the reference design's icon-forward dark chrome
 * (logo/workspace, search, nav, bottom-pinned account footer), built on
 * shadcn's Sidebar primitives per the ui-ux-pro-max shadcn guidance rather
 * than a hand-rolled fixed-width div. `--sidebar-*` tokens (app/globals.css)
 * keep it dark regardless of the rest of the shell's theme.
 */
export function AdminSidebar({
  organizationName,
  userName,
  userEmail,
  branchName,
  businessUnitName,
}: {
  organizationName: string
  userName: string
  userEmail: string
  branchName: string | null
  businessUnitName: string | null
}) {
  return (
    <Sidebar collapsible="icon" data-tour="app-sidebar">
      <SidebarHeader className="gap-3 p-3">
        <div className="flex items-center gap-2 px-1 py-1">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Bolt className="size-4" />
          </span>
          <span className="truncate text-sm font-semibold">{organizationName}</span>
        </div>
        <BusinessUnitSwitcher branchName={branchName} businessUnitName={businessUnitName} />
      </SidebarHeader>

      <SidebarContent>
        <NavList items={primaryNavItems} />
        <SidebarSeparator />
        <NavList items={secondaryNavItems} />
      </SidebarContent>

      <SidebarFooter className="gap-2 p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <Link href="/settings">
                <Avatar size="sm">
                  <AvatarFallback>{initials(userName)}</AvatarFallback>
                </Avatar>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{userName}</span>
                  <span className="truncate text-xs text-sidebar-foreground/60">{userEmail}</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <form action={signOut}>
          <button
            type="submit"
            className="w-full rounded-md px-2 py-1.5 text-left text-xs text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            Sign out
          </button>
        </form>
      </SidebarFooter>
    </Sidebar>
  )
}
