import { redirect } from 'next/navigation'

import { requireUser } from '@/lib/auth/guard'
import { fetchPermissionGrants } from '@/lib/auth/context'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PermissionsProvider } from '@/lib/auth/permissions-context'
import { getOrganizationBranding } from '@/lib/branding/queries'
import { getOnboardingState } from '@/lib/business-structure/queries'
import { BrandStyle } from '@/components/branding/brand-style'
import { AdminSidebar } from '@/components/shell/admin-sidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

/**
 * The Admin Dashboard shell (docs/milestones/04-design-system-and-app-shell.md
 * Scope: "sidebar/topbar navigation, information-dense layout"). Structurally
 * separate from app/(pos)/layout.tsx per the milestone's Technical
 * Requirement — the two share only the token system, not a layout tree.
 *
 * requireUser()/fetchPermissionGrants()/PermissionsProvider are unchanged
 * from Milestone 03 — this milestone is a visual restructuring of the same
 * authenticated shell, not a new authorization mechanism.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()

  // A signed-in user without a completed onboarding (this milestone's
  // Business Structure/onboarding scope) has no Branch/Business Unit for
  // this shell's nav to point at yet — send them to finish onboarding
  // first, same check app/(pos)/layout.tsx makes.
  const onboardingState = await getOnboardingState()
  if (!onboardingState.onboardingCompletedAt) {
    redirect('/onboarding')
  }

  const supabase = await createServerSupabaseClient()
  const [grants, branding] = await Promise.all([
    fetchPermissionGrants(supabase),
    getOrganizationBranding(),
  ])

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
          <SidebarInset className="m-2 rounded-xl shadow-elevated sm:m-3">{children}</SidebarInset>
        </SidebarProvider>
      </div>
    </PermissionsProvider>
  )
}
