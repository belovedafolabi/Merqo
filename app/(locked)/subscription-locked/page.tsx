import { Lock } from 'lucide-react'

import { signOut } from '@/app/(auth)/actions'
import { requireUser } from '@/lib/auth/guard'
import { getSubscriptionAccessState, getSubscriptionPricing } from '@/lib/subscription/queries'
import { SubscriptionStatusCard } from '@/components/subscription/status-card'
import { SubscriptionRenewForm } from '@/components/subscription/renew-form'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

/**
 * Shown to a signed-in user of an organization whose subscription has
 * expired (docs/milestones/13-…md Frontend Changes: "Expired/locked-out
 * screen shown to non-Super-Admin users of an expired organization").
 * Renders exclusively from subscription_access_state() — see
 * app/(locked)/layout.tsx's doc for why nothing else here can be trusted
 * to resolve once locked.
 *
 * Two variants by canRenew: the Owner gets the full status + renew flow;
 * everyone else gets a message pointing at their Owner. Both are reachable
 * because subscription.view survives the lock (20260825100500) — this
 * screen never needs to bypass that, only read it.
 */
export default async function SubscriptionLockedPage() {
  await requireUser()

  const state = await getSubscriptionAccessState()

  // Not actually locked (direct navigation, or the lock has since cleared) —
  // proxy.ts's own check already handles the redirect-away case for normal
  // navigation; this is only a fallback for a stale bookmark.
  const locked = state?.locked ?? false

  const pricing = state?.canRenew ? await getSubscriptionPricing() : []

  return (
    <Card className="w-full max-w-md gap-6 shadow-elevated">
      <CardHeader className="items-center gap-3 text-center">
        <span className="flex size-10 items-center justify-center rounded-xl bg-destructive text-white">
          <Lock className="size-5" />
        </span>
        <h1 className="text-h4 leading-none font-semibold">
          {locked ? 'Subscription expired' : 'Subscription'}
        </h1>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state && (
          <SubscriptionStatusCard
            organizationName={state.organizationName}
            status={state.status}
            billingPeriod={state.billingPeriod}
            currentPeriodEnd={state.currentPeriodEnd}
            daysRemaining={state.daysRemaining}
            priceMinor={state.priceMinor}
            currency={state.currency}
          />
        )}

        {state?.canRenew ? (
          <SubscriptionRenewForm organizationId={state.organizationId} pricing={pricing} />
        ) : (
          <p className="text-center text-body-sm text-muted-foreground">
            This organization&apos;s subscription has expired. Contact your organization&apos;s
            owner to renew access.
          </p>
        )}

        <form action={signOut}>
          <Button type="submit" variant="ghost" className="w-full">
            Sign out
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
