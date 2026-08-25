import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { billingPeriodLabel, formatMinor, type BillingPeriod } from '@/lib/subscription/periods'
import type { SubscriptionStatus } from '@/lib/subscription/status'

const STATUS_VARIANT: Record<SubscriptionStatus, 'default' | 'secondary' | 'destructive'> = {
  ACTIVE: 'secondary',
  EXPIRING: 'default',
  EXPIRED: 'destructive',
}

/**
 * The status half of the Owner subscription screen, and the top of the
 * locked screen — same component, reused, so "what your subscription looks
 * like" never drifts between the two.
 */
export function SubscriptionStatusCard({
  organizationName,
  status,
  billingPeriod,
  currentPeriodEnd,
  daysRemaining,
  priceMinor,
  currency,
}: {
  organizationName: string
  status: SubscriptionStatus | null
  billingPeriod: BillingPeriod | null
  currentPeriodEnd: string | null
  daysRemaining: number | null
  priceMinor: number | null
  currency: string | null
}) {
  const formattedDate = currentPeriodEnd
    ? new Date(currentPeriodEnd).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Subscription</CardTitle>
          {status && <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>}
        </div>
        <CardDescription>{organizationName}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-body-sm">
        {billingPeriod && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Plan</span>
            <span className="font-medium">{billingPeriodLabel(billingPeriod)}</span>
          </div>
        )}
        {priceMinor !== null && currency && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Price</span>
            <span className="font-medium tabular-nums">{formatMinor(priceMinor, currency)}</span>
          </div>
        )}
        {formattedDate && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              {status === 'EXPIRED' ? 'Expired on' : 'Renews on'}
            </span>
            <span className="font-medium">{formattedDate}</span>
          </div>
        )}
        {daysRemaining !== null && status !== 'EXPIRED' && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Days remaining</span>
            <span className="font-medium tabular-nums">{daysRemaining}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
