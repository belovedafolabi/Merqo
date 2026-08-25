'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { Can } from '@/components/auth/can'
import { useCurrentOrganizationId } from '@/lib/auth/permissions-context'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/settings', label: 'Overview', permission: null },
  { href: '/settings/organization', label: 'Organization', permission: null },
  { href: '/settings/branding', label: 'Branding', permission: null },
  { href: '/settings/receipts', label: 'Receipts', permission: null },
  { href: '/settings/notifications', label: 'Notifications', permission: null },
  // Milestone 13: every org member can view their organization's own
  // subscription (subscription.view is on Owner and every locked-out user
  // by construction — see 20260825100500), so this tab is unconditional
  // like every other one above it.
  { href: '/settings/subscription', label: 'Subscription', permission: null },
  // Super Admin only — hidden via <Can>, unlike every tab above, because
  // showing it to an Owner who will only ever hit a permission error on the
  // page is worse than not showing it at all.
  { href: '/settings/pricing', label: 'Pricing', permission: 'platform.manage_pricing' as const },
] as const

/**
 * The /settings hub's sub-navigation. Employees and Roles are deliberately
 * NOT tabs here — they are already primary/secondary sidebar items with
 * their own full-width screens (a directory table, a role-permission
 * checklist), and folding them into a narrow settings tab strip would
 * squeeze both. This hub covers what Milestone 11's Scope calls "business
 * configuration screens beyond what Milestone 05 covered at onboarding
 * time": organization profile, branding, and receipts — plus Milestone 12's
 * per-user notification preferences, which lives here rather than as its
 * own sidebar item for the same reason Employees/Roles do NOT: it is one
 * small form, not a full-width screen.
 */
export function SettingsNav() {
  const pathname = usePathname()
  const organizationId = useCurrentOrganizationId()

  return (
    <nav className="flex gap-1 border-b">
      {TABS.map((tab) => {
        const isActive = pathname === tab.href
        const link = (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'border-b-2 px-3 py-2 text-body-sm font-medium transition-colors',
              isActive
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        )

        if (!tab.permission || !organizationId) return link
        return (
          <Can key={tab.href} permission={tab.permission} scope={{ organizationId }}>
            {link}
          </Can>
        )
      })}
    </nav>
  )
}
