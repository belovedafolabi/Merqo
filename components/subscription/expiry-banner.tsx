import Link from 'next/link'
import { TriangleAlert } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { EXPIRY_WARNING_DAYS } from '@/lib/subscription/status'
import { getSubscriptionAccessState } from '@/lib/subscription/queries'

/**
 * The dashboard-wide expiry warning (PRD §38: "Subscription expires in X
 * days" + "Renew Subscription"), rendered inside app/(app)/layout.tsx above
 * every screen — not the topbar, which is height-constrained and already
 * hosts NotificationBell. Renders nothing once locked (the locked screen
 * takes over entirely) or with more than EXPIRY_WARNING_DAYS remaining.
 *
 * Escalates from `default` to `destructive` inside the warning window itself
 * (≤2 days) — not just present/absent — per the "color is not the only
 * signal" guideline: the icon and copy both change too, not color alone.
 */
export async function SubscriptionExpiryBanner() {
  const state = await getSubscriptionAccessState()
  if (!state || state.locked || state.daysRemaining === null) return null
  if (state.daysRemaining > EXPIRY_WARNING_DAYS) return null

  const urgent = state.daysRemaining <= 2
  const dayWord = state.daysRemaining === 1 ? 'day' : 'days'

  return (
    <div className="p-4 pb-0 sm:p-6 sm:pb-0">
      <Alert variant={urgent ? 'destructive' : 'default'}>
        <TriangleAlert />
        <AlertTitle>
          Subscription expires in {Math.max(state.daysRemaining, 0)} {dayWord}
        </AlertTitle>
        <AlertDescription>
          <Link href="/settings/subscription" className="underline underline-offset-4">
            Renew Subscription
          </Link>
        </AlertDescription>
      </Alert>
    </div>
  )
}
