'use client'

import { useActionState, useId, useState } from 'react'
import { TriangleAlert } from 'lucide-react'

import {
  initiateCheckoutAction,
  type SubscriptionActionState,
} from '@/app/(app)/settings/subscription/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { billingPeriodLabel, formatMinor, type BillingPeriod } from '@/lib/subscription/periods'
import type { SubscriptionPriceOption } from '@/lib/subscription/queries'

const initialState: SubscriptionActionState = { error: null }

/**
 * The duration picker + "Renew Subscription" CTA. Same BusinessTypePicker
 * shape (components/business-structure/business-type-picker.tsx) — a plain
 * Radix RadioGroup, since four options fit comfortably without a combobox.
 * Submitting redirects server-side to Paystack's hosted checkout — see
 * initiateCheckoutAction's own doc for why the authorization URL never
 * touches client state.
 */
export function SubscriptionRenewForm({
  organizationId,
  pricing,
}: {
  organizationId: string
  pricing: SubscriptionPriceOption[]
}) {
  const [state, formAction, pending] = useActionState(initiateCheckoutAction, initialState)
  const active = pricing.filter((option) => option.isActive)
  const [selected, setSelected] = useState<BillingPeriod | undefined>(active[0]?.billingPeriod)
  const groupId = useId()

  if (active.length === 0) {
    return (
      <Alert variant="destructive">
        <TriangleAlert />
        <AlertDescription>
          Online payment is not configured for this deployment yet. Contact support to renew.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <form
      action={(formData) => {
        formData.set('organizationId', organizationId)
        formAction(formData)
      }}
      className="flex flex-col gap-4"
    >
      {state.error && (
        <Alert variant="destructive" role="alert">
          <TriangleAlert />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <RadioGroup
        name="billingPeriod"
        value={selected}
        onValueChange={(value) => setSelected(value as BillingPeriod)}
        className="grid gap-3 sm:grid-cols-2"
      >
        {active.map((option) => {
          const itemId = `${groupId}-${option.billingPeriod}`
          return (
            <Label
              key={option.billingPeriod}
              htmlFor={itemId}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-3 rounded-lg border bg-card p-4 text-sm font-normal transition-colors hover:bg-accent/50',
                'has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5',
              )}
            >
              <span className="flex items-center gap-3">
                <RadioGroupItem value={option.billingPeriod} id={itemId} />
                <span className="font-medium">{billingPeriodLabel(option.billingPeriod)}</span>
              </span>
              <span className="text-muted-foreground tabular-nums">
                {formatMinor(option.priceMinor, option.currency)}
              </span>
            </Label>
          )
        })}
      </RadioGroup>

      <Button type="submit" disabled={pending || !selected} className="self-start">
        {pending ? 'Redirecting to Paystack…' : 'Renew subscription'}
      </Button>
    </form>
  )
}
