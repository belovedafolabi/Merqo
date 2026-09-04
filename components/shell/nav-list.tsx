'use client'

import Link, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import {
  Banknote,
  Boxes,
  Building2,
  LayoutDashboard,
  Package,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

import { Can } from '@/components/auth/can'
import { useCurrentOrganizationId } from '@/lib/auth/permissions-context'
import { useTerminology } from '@/lib/terminology/terminology-context'
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
 * The icon-name -> component lookup lives here, not in lib/shell/nav-items.ts
 * — see that module's doc for why (a Lucide component reference isn't
 * serializable across the Server Component -> Client Component boundary
 * this file's own `'use client'` creates).
 */
const ICONS: Record<NavItem['icon'], LucideIcon> = {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Package,
  Boxes,
  Users,
  Wallet,
  ScrollText,
  TrendingUp,
  Banknote,
  Building2,
  Settings,
  UserCog,
  ShieldCheck,
}

/**
 * A spinner that appears in place of the nav icon while THIS link's
 * destination is being fetched — Next 16's useLinkStatus, per the bundled
 * docs (node_modules/next/dist/docs/.../use-link-status.md). Every admin
 * route now has a `loading.tsx`, so most navigations are instant and this
 * never shows; it is the affordance for the occasional slow one (a cold
 * report, an uncached list). `motion-reduce` drops the spin.
 */
function NavPendingIcon({ Icon }: { Icon: LucideIcon }) {
  const { pending } = useLinkStatus()
  return pending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Icon />
}

/**
 * Renders one nav section, gating each item behind `<Can>` when it declares
 * a `permission` (see lib/shell/nav-items.ts for why most don't yet).
 * Active-item highlighting compares against the current pathname, per
 * docs/UXUI_Design_System_Specification.md §12/§53 (visible current
 * location, not color-only — `isActive` also drives `font-medium`).
 */
/**
 * Milestone 17 Part B — a few nav labels take the business unit's terminology
 * ("Sales" → "Bills" for a restaurant). Only the three whose noun has a
 * term_key; the rest are fixed.
 */
const NAV_LABEL_TERM: Record<string, 'sale' | 'product' | 'customer'> = {
  '/sales': 'sale',
  '/products': 'product',
  '/customers': 'customer',
}

export function NavList({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  const organizationId = useCurrentOrganizationId()
  const t = useTerminology()

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
            const Icon = ICONS[item.icon]
            const termKey = NAV_LABEL_TERM[item.href]
            const label = termKey ? t(termKey, { plural: true }) : item.label
            const button = (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
                  <Link href={item.href}>
                    <NavPendingIcon Icon={Icon} />
                    <span>{label}</span>
                  </Link>
                </SidebarMenuButton>
                {item.badge && <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>}
              </SidebarMenuItem>
            )

            if (!item.permission || !organizationId) return button

            return (
              <Can key={item.href} permission={item.permission.key} scope={{ organizationId }}>
                {button}
              </Can>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
