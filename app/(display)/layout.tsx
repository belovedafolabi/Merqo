import { redirect } from 'next/navigation'

import { BrandStyle } from '@/components/branding/brand-style'
import { requireUser } from '@/lib/auth/guard'
import { getOnboardingState } from '@/lib/business-structure/queries'

/**
 * Shell for the customer-facing display (Milestone 14).
 *
 * Its own route group rather than living under app/(pos): that layout mounts
 * PosHeader — cashier name, branch, Returns link, menu — and there is no
 * mechanism in this codebase to opt out of an ancestor layout (the same
 * constraint app/(app)/receipts/preview/page.tsx documents). A screen facing
 * the customer must show none of that chrome.
 *
 * NOT public. /display is absent from proxy.ts's PUBLIC_PATHS, so it is gated
 * exactly like /pos. It works because the display is opened from the
 * cashier's own browser via window.open and therefore shares that session's
 * cookies — which is the whole reason the BroadcastChannel transport needs no
 * new authorization surface. See lib/pos/customer-display.ts.
 *
 * BrandStyle is an async Server Component, so it can only be mounted from a
 * server tree — this layout is what lets the display carry the organization's
 * colours at all.
 */
export default async function DisplayLayout({ children }: { children: React.ReactNode }) {
  await requireUser()

  const onboardingState = await getOnboardingState()
  if (!onboardingState.onboardingCompletedAt || !onboardingState.organizationId) {
    redirect('/onboarding')
  }

  return (
    <>
      <BrandStyle />
      {children}
    </>
  )
}
