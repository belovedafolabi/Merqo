import { Suspense } from 'react'
import { redirect } from 'next/navigation'

import { getCurrentUserContext } from '@/lib/auth/context'
import { PermissionsProvider } from '@/lib/auth/permissions-context'
import { getOrganizationBranding } from '@/lib/branding/queries'
import { getOnboardingState } from '@/lib/business-structure/queries'
import { BrandStyle } from '@/components/branding/brand-style'
import { AdminSidebar } from '@/components/shell/admin-sidebar'
import { SidebarCloseOnNavigate } from '@/components/shell/sidebar-close-on-navigate'
import { SubscriptionExpiryBanner } from '@/components/subscription/expiry-banner'
import { ProductTour } from '@/components/tour/product-tour'
import { hasCompletedTour } from '@/lib/tour/queries'
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
  const [onboardingState, branding, tourCompleted] = await Promise.all([
    getOnboardingState(),
    getOrganizationBranding(),
    hasCompletedTour(),
  ])
  if (!onboardingState.onboardingCompletedAt) {
    redirect('/onboarding')
  }

  const userName = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? 'User'

  return (
    <PermissionsProvider grants={grants}>
      <BrandStyle />
      {/* `overflow-x-clip` — a shell-level backstop against any page whose
          content still manages to exceed the viewport width (the fix belongs
          at each offender, but the shell should never let the whole page
          scroll sideways on a phone). Clip, not hidden: no scroll container,
          no effect on `position: sticky` descendants. */}
      <div className="bg-admin-canvas min-h-svh overflow-x-clip p-2 sm:p-3">
        <SidebarProvider className="min-h-[calc(100svh-1.5rem)]">
          {/* Deliberately a sibling of <AdminSidebar>, not a child of it.
              On mobile <Sidebar> renders its children inside a Radix Sheet,
              which only mounts them while the Sheet is open — so mounting
              this there made its "close on navigate" effect fire the instant
              the menu opened, closing it again in the same commit. Out here
              it stays mounted for the life of the shell and only reacts to a
              real pathname change. */}
          <SidebarCloseOnNavigate />
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
          {/* Inside SidebarProvider so the tour can open the mobile nav Sheet
              (whose nav links are otherwise unmounted) before building its
              step list. */}
          <ProductTour area="admin" autoStart={!tourCompleted} />
        </SidebarProvider>
      </div>
    </PermissionsProvider>
  )
}
