'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Check, TriangleAlert } from 'lucide-react'

import {
  confirmPaymentAction,
  type SubscriptionActionState,
} from '@/app/(app)/settings/subscription/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'

const initialState: SubscriptionActionState = { error: null }

/**
 * Auto-confirms a payment on return from Paystack's hosted checkout
 * (`?reference=...` on the callback URL — see
 * initiateSubscriptionCheckout()'s callbackUrl). Submits itself once on
 * mount rather than waiting for a click, since the user has already done
 * the one action this page needs from them (paying) before landing here.
 *
 * Calls the SAME settlePaystackPayment() the webhook uses
 * (lib/subscription/settlement.ts) — whichever of the two arrives first
 * extends the subscription; this one is very likely to lose that race to
 * the webhook and see 'duplicate', which is why that outcome renders as a
 * success notice too, not an error.
 */
export function PaymentConfirmationNotice({
  organizationId,
  reference,
}: {
  organizationId: string
  reference: string
}) {
  const [state, formAction] = useActionState(confirmPaymentAction, initialState)
  const router = useRouter()
  const submitted = useRef(false)

  useEffect(() => {
    if (submitted.current) return
    submitted.current = true
    const formData = new FormData()
    formData.set('organizationId', organizationId)
    formData.set('reference', reference)
    formAction(formData)
  }, [organizationId, reference, formAction])

  useEffect(() => {
    if (!state.notice) return
    // Strip ?reference= from the URL a few seconds after a successful
    // confirmation, once the notice has had time to actually be read —
    // harmless to leave it (settlement is idempotent) but noisy on refresh.
    const timeout = setTimeout(() => router.replace('/settings/subscription'), 4000)
    return () => clearTimeout(timeout)
  }, [state, router])

  if (state.error) {
    return (
      <Alert variant="destructive" role="alert">
        <TriangleAlert />
        <AlertDescription>{state.error}</AlertDescription>
      </Alert>
    )
  }

  if (state.notice) {
    return (
      <Alert>
        <Check />
        <AlertDescription>{state.notice}</AlertDescription>
      </Alert>
    )
  }

  return (
    <Alert>
      <AlertDescription>Confirming your payment…</AlertDescription>
    </Alert>
  )
}
