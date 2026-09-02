import { Suspense } from 'react'
import { redirect } from 'next/navigation'

import { getCurrentUserContext } from '@/lib/auth/context'
import { PermissionsProvider } from '@/lib/auth/permissions-context'
import { getOrganizationBranding } from '@/lib/branding/queries'
import { getOnboardingState } from '@/lib/business-structure/queries'
import { BrandStyle } from '@/components/branding/brand-style'
import { AdminSidebar } from '@/components/shell/admin-sidebar'
import { SubscriptionExpiryBanner } from '@/components/subscription/expiry-banner'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

/**
 * The Admin Dashboard shell (docs/milestones/04-design-system-and-app-shell.md
 * Scope: "sidebar/topbar navigation, information-dense layout"). Structurally
 * separate from app/(pos)/layout.tsx per the milestone's Technical
 * Requirement — the two share only the token system, not a layout tree.
 *
 * Auth is getCurrentUserContext() (Milestone 03) — it already fetches AND
 * cache()-memoizes both the user and the permission grants for the request,
 * so the layout reads `grants` straight off it instead of a second,
 * un-cached fetchPermissionGrants() round trip (every page under this layout
 * also calls requirePermission(), which shares the same cached context).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, grants } = await getCurrentUserContext()
  if (!user) redirect('/sign-in')

  // A signed-in user without a completed onboarding (this milestone's
  // Business Structure/onboarding scope) has no Branch/Business Unit for
  // this shell's nav to point at yet — send them to finish onboarding
  // first, same check app/(pos)/layout.tsx makes. Branding is fetched
  // alongside (independent) so the two don't serialize.
  const [onboardingState, branding] = await Promise.all([
    getOnboardingState(),
    getOrganizationBranding(),
  ])
  if (!onboardingState.onboardingCompletedAt) {
    redirect('/onboarding')
  }

  const userName = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? 'User'

  return (
    <PermissionsProvider grants={grants}>
      <BrandStyle />
      <div className="bg-admin-canvas min-h-svh p-2 sm:p-3">
        <SidebarProvider className="min-h-[calc(100svh-1.5rem)]">
          <AdminSidebar
            organizationName={branding?.displayName ?? 'Merqo'}
            userName={userName}
            userEmail={user.email ?? ''}
            branchName={onboardingState.branch?.name ?? null}
            businessUnitName={onboardingState.businessUnit?.name ?? null}
          />
          <SidebarInset className="m-2 rounded-xl shadow-elevated sm:m-3">
            {/* Off the shell's critical path: the expiry banner's
                subscription_access_state query streams in rather than
                blocking first paint — same treatment AdminTopbar gives the
                notification bell. */}
            <Suspense fallback={null}>
              <SubscriptionExpiryBanner />
            </Suspense>
            {children}
          </SidebarInset>
        </SidebarProvider>
      </div>
    </PermissionsProvider>
  )
}
