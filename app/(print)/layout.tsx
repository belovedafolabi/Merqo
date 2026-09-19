import { redirect } from 'next/navigation'

import { BrandStyle } from '@/components/branding/brand-style'
import { requireUser } from '@/lib/auth/guard'
import { getOnboardingState } from '@/lib/business-structure/queries'

/**
 * Bare shell for printable documents — currently just the receipt printer
 * (app/(print)/receipt/[saleId]). Its own route group, exactly like
 * app/(display)/layout.tsx and for the same documented reason: there is no
 * mechanism in this codebase to opt out of an ancestor layout, and a page
 * loaded into a hidden iframe purely to `window.print()` itself must carry
 * NONE of the (app) sidebar/topbar chrome — otherwise the chrome prints too
 * (that was the "receipt print shows the whole POS" bug on Android tablets).
 *
 * NOT public. `/print/*` is absent from proxy.ts's PUBLIC_PATHS, so it is
 * gated exactly like /pos and /display — the iframe shares the cashier's
 * session cookie, which is all the authorization it needs.
 *
 * BrandStyle is an async Server Component (org colours on the receipt), so it
 * can only be mounted from a server tree — this layout is what lets the
 * printed receipt carry the organization's branding.
 */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
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
