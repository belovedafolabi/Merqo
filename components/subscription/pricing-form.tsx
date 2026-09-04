'use client'

import { useActionState, useState } from 'react'
import { Check, TriangleAlert } from 'lucide-react'

import { updatePriceAction, type PricingActionState } from '@/app/(app)/settings/pricing/actions'
import { useActionToast } from '@/hooks/use-action-toast'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { billingPeriodLabel, type BillingPeriod } from '@/lib/subscription/periods'
import type { SubscriptionPriceOption } from '@/lib/subscription/queries'

const initialState: PricingActionState = { error: null }

/**
 * The Super Admin pricing configuration screen: one row per duration, each
 * its own independent form (so saving Monthly does not require re-entering
 * Quarterly). Price is entered in major units (Naira) and converted to
 * minor units server-side (lib/subscription/mutations.ts's
 * updateSubscriptionPrice()) — never trusted as minor units from the form.
 */
export function SubscriptionPricingForm({
  organizationId,
  pricing,
}: {
  organizationId: string
  pricing: SubscriptionPriceOption[]
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {pricing.map((option) => (
        <PricingRow key={option.billingPeriod} organizationId={organizationId} option={option} />
      ))}
    </div>
  )
}

function PricingRow({
  organizationId,
  option,
}: {
  organizationId: string
  option: SubscriptionPriceOption
}) {
  const [state, formAction, pending] = useActionState(updatePriceAction, initialState)
  useActionToast(state, pending, { loading: 'Saving price…', success: 'Price saved' })
  const [priceMajor, setPriceMajor] = useState(String(option.priceMinor / 100))

  return (
    <Card>
      <CardHeader>
        <CardTitle>{billingPeriodLabel(option.billingPeriod as BillingPeriod)}</CardTitle>
        <CardDescription>
          {option.isActive
            ? 'Active — shown to Owners at renewal'
            : 'Inactive — hidden from renewal'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          action={(formData) => {
            formData.set('organizationId', organizationId)
            formData.set('billingPeriod', option.billingPeriod)
            formAction(formData)
          }}
          className="flex flex-col gap-3"
        >
          {state.error && (
            <Alert variant="destructive" role="alert">
              <TriangleAlert />
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {state !== initialState && state.error === null && (
            <Alert>
              <Check />
              <AlertDescription>Saved.</AlertDescription>
            </Alert>
          )}

          <div className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor={`price-${option.billingPeriod}`}>Price ({option.currency})</Label>
              <Input
                id={`price-${option.billingPeriod}`}
                name="priceMajor"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={priceMajor}
                onChange={(event) => setPriceMajor(event.target.value)}
                required
              />
            </div>
            <input type="hidden" name="currency" value={option.currency} />
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
