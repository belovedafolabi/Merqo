import { redirect } from 'next/navigation'

import { getCurrentUserContext } from '@/lib/auth/context'
import { PermissionsProvider } from '@/lib/auth/permissions-context'
import { getOnboardingState, getBusinessUnitPosConfig } from '@/lib/business-structure/queries'
import { PosSessionProvider } from '@/lib/pos/session-context'
import { CartProvider } from '@/lib/pos/cart-context'
import { BrandStyle } from '@/components/branding/brand-style'
import { PosHeader } from '@/components/pos/pos-header'
import { CustomerDisplayPublisher } from '@/components/pos/customer-display-publisher'
import { ProductTour } from '@/components/tour/product-tour'
import { hasCompletedTour } from '@/lib/tour/queries'

/**
 * A user who holds any of these is a manager/owner, not a till-only
 * operator — the "Back to Admin dashboard" item in the POS menu sheet is
 * shown only to them. Cashier / Salesperson / Pharmacist hold none of these
 * (reports.export is withheld from till roles by design — supabase/seed.sql),
 * and Waiter / Kitchen Staff hold no permissions at all.
 */
const ADMIN_ACCESS_KEYS = new Set([
  'business_units.view',
  'employees.view',
  'organizations.update',
  'reports.export',
])

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
  // getCurrentUserContext() already fetches + cache()-memoizes the user and
  // the permission grants for this request — read `grants` off it instead of
  // a second un-cached fetchPermissionGrants() round trip.
  const { user, grants } = await getCurrentUserContext()
  if (!user) redirect('/sign-in')

  const onboardingState = await getOnboardingState()
  if (
    !onboardingState.onboardingCompletedAt ||
    !onboardingState.organizationId ||
    !onboardingState.branch ||
    !onboardingState.businessUnit
  ) {
    redirect('/onboarding')
  }

  const posConfig = await getBusinessUnitPosConfig(onboardingState.businessUnit.id)
  if (!posConfig) {
    redirect('/onboarding')
  }

  const tourCompleted = await hasCompletedTour()

  const cashierName =
    (user.user_metadata?.full_name as string | undefined) ?? user.email ?? 'Cashier'
  const canReachAdmin = grants.some((grant) => ADMIN_ACCESS_KEYS.has(grant.permissionKey))

  return (
    <PermissionsProvider grants={grants}>
      <PosSessionProvider
        session={{
          organizationId: onboardingState.organizationId,
          branchId: onboardingState.branch.id,
          businessUnitId: onboardingState.businessUnit.id,
          posConfig,
        }}
      >
        <CartProvider>
          <BrandStyle />
          {/* Mirrors the cart to any open customer-facing display. Renders
              nothing; must sit inside CartProvider to read it. */}
          <CustomerDisplayPublisher />
          {/* dvh, not svh: on mobile Safari svh is the SMALLEST viewport
              (URL bar expanded), which left a gap under the till whenever
              the bar was collapsed. */}
          <div className="flex min-h-dvh flex-col bg-background">
            <PosHeader
              cashierName={cashierName}
              branchName={onboardingState.branch.name}
              businessUnitName={onboardingState.businessUnit.name}
              canReachAdmin={canReachAdmin}
            />
            <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
          </div>
          <ProductTour area="pos" autoStart={!tourCompleted} />
        </CartProvider>
      </PosSessionProvider>
    </PermissionsProvider>
  )
}
