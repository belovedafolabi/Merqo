'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { Can } from '@/components/auth/can'
import { useCurrentOrganizationId } from '@/lib/auth/permissions-context'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import type { NavItem } from '@/lib/shell/nav-items'

/**
 * Renders one nav section, gating each item behind `<Can>` when it declares
 * a `permission` (see lib/shell/nav-items.ts for why most don't yet).
 * Active-item highlighting compares against the current pathname, per
 * docs/UXUI_Design_System_Specification.md §12/§53 (visible current
 * location, not color-only — `isActive` also drives `font-medium`).
 */
export function NavList({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  const organizationId = useCurrentOrganizationId()

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
            const button = (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
                {item.badge && <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>}
              </SidebarMenuItem>
            )

            if (!item.permission || !organizationId) return button

            return (
              <Can
                key={item.href}
                permission={item.permission.key}
                scope={item.permission.scope(organizationId)}
              >
                {button}
              </Can>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
