'use client'

import { useSearchParams } from 'next/navigation'
import { TriangleAlert } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'

/** proxy.ts's Milestone 11 deactivation redirect — see that file's Security
 *  Requirement comment for why this exists rather than a silently empty app. */
const DEACTIVATED_MESSAGE = 'Your account has been deactivated. Contact your administrator.'

/** app/(auth)/actions.ts's signIn() — Milestone 13's subscription lock,
 *  the "login is disabled ... directing the Owner to renew" branch. */
const SUBSCRIPTION_EXPIRED_MESSAGE =
  "This organization's subscription has expired. Contact your organization's owner to renew."

/**
 * Renders proxy.ts's `?reason=` signed-out notice (deactivation) or signIn()'s
 * subscription-locked notice as its own destructive Alert — or nothing at all.
 *
 * Split out of SignInPage so useSearchParams()'s Suspense requirement doesn't
 * force the form (and useActionState's submit affordance) behind a fallback.
 * Crucially this component *returns null* when there is no `reason`, unlike the
 * previous `state.error ?? <Suspense><SignInReasonNotice/></Suspense>` shape:
 * that `??` fallback was always a truthy element, so AuthCard's `{error && …}`
 * guard rendered an empty red alert on every cold visit before the user typed
 * anything.
 */
export function AuthReasonAlert() {
  const reason = useSearchParams().get('reason')
  const message =
    reason === 'deactivated'
      ? DEACTIVATED_MESSAGE
      : reason === 'subscription_expired'
        ? SUBSCRIPTION_EXPIRED_MESSAGE
        : null

  if (!message) return null

  return (
    <Alert variant="destructive" role="alert">
      <TriangleAlert />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}
