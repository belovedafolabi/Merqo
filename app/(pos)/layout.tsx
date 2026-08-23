import { redirect } from 'next/navigation'

import { requireUser } from '@/lib/auth/guard'
import { fetchPermissionGrants } from '@/lib/auth/context'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PermissionsProvider } from '@/lib/auth/permissions-context'
import { getOnboardingState } from '@/lib/business-structure/queries'
import { BrandStyle } from '@/components/branding/brand-style'
import { PosHeader } from '@/components/pos/pos-header'

/**
 * POS shell — structurally separate route tree from app/(app), per
 * docs/milestones/04-design-system-and-app-shell.md's Technical Requirement.
 * Deliberately stays on the light neutral theme (no dark canvas, no
 * sidebar) — docs/UXUI_Design_System_Specification.md §56, reasoned for
 * retail-environment lighting/scanner legibility/printing. Same token
 * system as the Admin shell (BrandStyle, --primary, --radius, --shadow-*),
 * just a different composition on top of it.
 */
export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()

  const onboardingState = await getOnboardingState()
  if (!onboardingState.onboardingCompletedAt) {
    redirect('/onboarding')
  }

  const supabase = await createServerSupabaseClient()
  const grants = await fetchPermissionGrants(supabase)

  const cashierName =
    (user.user_metadata?.full_name as string | undefined) ?? user.email ?? 'Cashier'

  return (
    <PermissionsProvider grants={grants}>
      <BrandStyle />
      <div className="flex min-h-svh flex-col bg-background">
        <PosHeader cashierName={cashierName} />
        <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </PermissionsProvider>
  )
}
