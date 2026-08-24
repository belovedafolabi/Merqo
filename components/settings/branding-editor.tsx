'use client'

import { useActionState } from 'react'
import { Check, TriangleAlert } from 'lucide-react'

import { updateBrandingAction, type SettingsActionState } from '@/app/(app)/settings/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BrandColorField } from '@/components/settings/brand-color-field'
import { LogoUploadField } from '@/components/settings/logo-upload-field'
import type { OrganizationBranding } from '@/lib/branding/queries'

const initialState: SettingsActionState = { error: null }

/**
 * Brand name, colors (with the live contrast warning), and logo — the write
 * path Milestone 04 deferred. Changes apply immediately across the Admin
 * Dashboard and POS shells (Milestone 11's Functional Requirement) because
 * both mount <BrandStyle> off the same lib/branding/queries.ts read this
 * screen writes to, and every action here revalidates '/' at layout scope.
 */
export function BrandingEditor({
  organizationId,
  branding,
}: {
  organizationId: string
  branding: OrganizationBranding
}) {
  const [state, formAction, pending] = useActionState(updateBrandingAction, initialState)

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Branding</CardTitle>
        <CardDescription>Shown across the Admin Dashboard and POS.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label>Logo</Label>
          <LogoUploadField organizationId={organizationId} currentLogoUrl={branding.logoUrl} />
        </div>

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
            <Label htmlFor="brand-name">Brand name</Label>
            <Input
              id="brand-name"
              name="brandName"
              defaultValue={branding.displayName}
              maxLength={120}
              placeholder="Shown instead of your organization's legal name"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <BrandColorField
              name="primaryColor"
              label="Primary color"
              defaultValue={branding.primaryColor}
            />
            <BrandColorField
              name="secondaryColor"
              label="Secondary color"
              defaultValue={branding.secondaryColor}
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
