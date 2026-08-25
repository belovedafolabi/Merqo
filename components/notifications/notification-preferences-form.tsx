'use client'

import { useActionState } from 'react'
import { Check, TriangleAlert } from 'lucide-react'

import {
  updateNotificationPreferencesAction,
  type SettingsActionState,
} from '@/app/(app)/settings/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import type { NotificationPreference } from '@/lib/notifications/queries'

const initialState: SettingsActionState = { error: null }

/**
 * One row per category (lib/notifications/types.ts's NOTIFICATION_CATEGORIES
 * — deliberately coarse, not per-event-type). A mandatory category renders
 * both switches disabled with a "Required" badge — the friendly version of
 * a rule notification_preferences_update_self's RLS WITH CHECK
 * (20260824100300) enforces regardless: a raw API write trying to disable
 * security or billing is rejected by the database, not just hidden by this
 * form.
 *
 * Each row is its own form/useActionState pair, same per-row-independent-
 * state shape as components/employees/pending-invitations-list.tsx's
 * RevokeButton, so toggling one category's switch does not disturb another
 * row's pending/error state.
 */
function PreferenceRowHeader({ preference }: { preference: NotificationPreference }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <span className="font-medium">{preference.label}</span>
        {preference.mandatory && (
          <Badge variant="secondary" className="text-[10px]">
            Required
          </Badge>
        )}
      </div>
      <p className="text-body-sm text-muted-foreground">{preference.description}</p>
    </div>
  )
}

/**
 * A mandatory category (security, billing) is not wrapped in a <form> at
 * all — a disabled Radix <Switch> is excluded from FormData on submit
 * (standard HTML behaviour for disabled controls), so a submit here would
 * send both booleans as absent, read as false, and be rejected by
 * notification_preferences_update_self's RLS WITH CHECK. Rendering no
 * interactive form for a row with nothing submittable avoids surfacing that
 * rejection as a confusing inline error for a switch the user never touched.
 */
function MandatoryPreferenceRow({ preference }: { preference: NotificationPreference }) {
  return (
    <div className="flex flex-col gap-3 border-b pb-4 last:border-b-0 last:pb-0">
      <PreferenceRowHeader preference={preference} />
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2">
          <Switch checked disabled />
          <span className="text-body-sm">In-app</span>
        </label>
        <label className="flex items-center gap-2">
          <Switch checked disabled />
          <span className="text-body-sm">Email</span>
        </label>
      </div>
    </div>
  )
}

function EditablePreferenceRow({ preference }: { preference: NotificationPreference }) {
  const [state, formAction, pending] = useActionState(
    updateNotificationPreferencesAction,
    initialState,
  )

  return (
    <div className="flex flex-col gap-3 border-b pb-4 last:border-b-0 last:pb-0">
      <form
        action={(formData) => {
          formData.set('category', preference.category)
          formAction(formData)
        }}
        className="flex flex-col gap-3"
      >
        <div className="flex items-start justify-between gap-4">
          <PreferenceRowHeader preference={preference} />
          <Button type="submit" variant="ghost" size="sm" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </div>

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2">
            <Switch name="inAppEnabled" defaultChecked={preference.inAppEnabled} />
            <span className="text-body-sm">In-app</span>
          </label>
          <label className="flex items-center gap-2">
            <Switch name="emailEnabled" defaultChecked={preference.emailEnabled} />
            <span className="text-body-sm">Email</span>
          </label>
        </div>

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
      </form>
    </div>
  )
}

function PreferenceRow({ preference }: { preference: NotificationPreference }) {
  return preference.mandatory ? (
    <MandatoryPreferenceRow preference={preference} />
  ) : (
    <EditablePreferenceRow preference={preference} />
  )
}

export function NotificationPreferencesForm({
  preferences,
}: {
  preferences: NotificationPreference[]
}) {
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>
          Choose which categories reach you in-app or by email. Security and billing alerts cannot
          be turned off.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {preferences.map((preference) => (
          <PreferenceRow key={preference.category} preference={preference} />
        ))}
      </CardContent>
    </Card>
  )
}
