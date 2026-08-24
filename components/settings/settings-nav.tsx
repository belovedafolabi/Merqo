'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

const TABS = [
  { href: '/settings', label: 'Overview' },
  { href: '/settings/organization', label: 'Organization' },
  { href: '/settings/branding', label: 'Branding' },
  { href: '/settings/receipts', label: 'Receipts' },
  { href: '/settings/notifications', label: 'Notifications' },
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

  return (
    <nav className="flex gap-1 border-b">
      {TABS.map((tab) => {
        const isActive = pathname === tab.href
        return (
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
      })}
    </nav>
  )
}
