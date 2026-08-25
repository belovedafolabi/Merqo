import { redirect } from 'next/navigation'

import { requirePermission } from '@/lib/auth/guard'
import { getOnboardingState } from '@/lib/business-structure/queries'
import {
  getSubscriptionAccessState,
  getSubscriptionPricing,
  listSubscriptionPayments,
} from '@/lib/subscription/queries'
import { formatMinor } from '@/lib/subscription/periods'
import { SubscriptionStatusCard } from '@/components/subscription/status-card'
import { SubscriptionRenewForm } from '@/components/subscription/renew-form'
import { PaymentConfirmationNotice } from '@/components/subscription/payment-confirmation-notice'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

/**
 * The Owner subscription screen (docs/milestones/13-…md Frontend Changes:
 * "current status, duration selection, price display, 'Renew Subscription'
 * flow"). Reachable even while locked — subscription.view survives the lock
 * (20260825100500) — so this doubles as the locked Owner's way back in.
 */
export default async function SubscriptionSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string }>
}) {
  const onboardingState = await getOnboardingState()
  const organizationId = onboardingState.organizationId
  if (!organizationId) redirect('/sign-in')

  await requirePermission('subscription.view', { organizationId })

  const [state, pricing, payments, params] = await Promise.all([
    getSubscriptionAccessState(),
    getSubscriptionPricing(),
    listSubscriptionPayments(organizationId),
    searchParams,
  ])

  if (!state) redirect('/sign-in')

  return (
    <div className="flex flex-col gap-4">
      {params.reference && (
        <PaymentConfirmationNotice organizationId={organizationId} reference={params.reference} />
      )}

      <SubscriptionStatusCard
        organizationName={state.organizationName}
        status={state.status}
        billingPeriod={state.billingPeriod}
        currentPeriodEnd={state.currentPeriodEnd}
        daysRemaining={state.daysRemaining}
        priceMinor={state.priceMinor}
        currency={state.currency}
      />

      {state.canRenew && (
        <Card>
          <CardHeader>
            <CardTitle>Renew subscription</CardTitle>
            <CardDescription>Choose a duration and continue to Paystack to pay.</CardDescription>
          </CardHeader>
          <CardContent>
            <SubscriptionRenewForm organizationId={organizationId} pricing={pricing} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-body-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>{new Date(payment.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>{payment.billingPeriod}</TableCell>
                      <TableCell className="tabular-nums">
                        {formatMinor(payment.amountMinor, payment.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            payment.status === 'SUCCESS'
                              ? 'secondary'
                              : payment.status === 'PENDING'
                                ? 'outline'
                                : 'destructive'
                          }
                        >
                          {payment.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
