'use client'

import { useActionState } from 'react'
import { Check, TriangleAlert } from 'lucide-react'

import {
  updateOrganizationProfileAction,
  type SettingsActionState,
} from '@/app/(app)/settings/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { OrganizationProfile } from '@/lib/organization/queries'
import { InfoHint } from '@/components/ui/field-hint'
import { FORM_HINTS } from '@/lib/form-hints'

const initialState: SettingsActionState = { error: null }

/**
 * Contact details and address — the "ongoing organization-level
 * configuration" bullet, and the business-information half of what a
 * receipt prints (docs/PRD.md §30). Deliberately excludes the
 * organization's `name`/`slug` — see lib/organization/schemas.ts's doc for
 * why.
 */
export function OrganizationProfileForm({
  organizationId,
  profile,
}: {
  organizationId: string
  profile: OrganizationProfile
}) {
  const [state, formAction, pending] = useActionState(updateOrganizationProfileAction, initialState)

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Organization</CardTitle>
        <CardDescription>
          {profile.name} — contact details printed on receipts and reports.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
          {state !== initialState && state.error === null && (
            <Alert>
              <Check />
              <AlertDescription>Saved.</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="contact-phone">
              Phone
              <InfoHint text={FORM_HINTS.organization.phone} />
            </Label>
            <Input
              id="contact-phone"
              name="contactPhone"
              defaultValue={profile.contactPhone ?? ''}
              maxLength={30}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="contact-email">
              Email
              <InfoHint text={FORM_HINTS.organization.email} />
            </Label>
            <Input
              id="contact-email"
              name="contactEmail"
              type="email"
              defaultValue={profile.contactEmail ?? ''}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="address-line">
              Address
              <InfoHint text={FORM_HINTS.organization.address} />
            </Label>
            <Input
              id="address-line"
              name="addressLine"
              defaultValue={profile.addressLine ?? ''}
              maxLength={200}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="default-low-stock-threshold">
              Default low-stock threshold
              <InfoHint text={FORM_HINTS.organization.defaultLowStockThreshold} />
            </Label>
            <Input
              id="default-low-stock-threshold"
              name="defaultLowStockThreshold"
              type="number"
              min={0}
              step="1"
              inputMode="numeric"
              placeholder="e.g. 5"
              defaultValue={profile.defaultLowStockThreshold ?? ''}
              className="max-w-40"
            />
          </div>

          <Button type="submit" disabled={pending} className="self-start">
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
