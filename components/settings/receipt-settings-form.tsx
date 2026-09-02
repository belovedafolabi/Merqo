'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Check, ExternalLink, TriangleAlert } from 'lucide-react'

import { updateReceiptSettingsAction, type SettingsActionState } from '@/app/(app)/settings/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ReceiptTemplatePicker } from '@/components/settings/receipt-template-picker'
import type { OrganizationBranding } from '@/lib/branding/queries'
import type { ReceiptSettings } from '@/lib/receipts/settings'
import type { ReceiptTemplateId } from '@/lib/receipts/templates'
import { InfoHint } from '@/components/ui/field-hint'
import { FORM_HINTS } from '@/lib/form-hints'

const initialState: SettingsActionState = { error: null }

export function ReceiptSettingsForm({
  organizationId,
  settings,
  branding,
}: {
  organizationId: string
  settings: ReceiptSettings
  branding: Pick<OrganizationBranding, 'displayName' | 'logoUrl'> | null
}) {
  const [state, formAction, pending] = useActionState(updateReceiptSettingsAction, initialState)
  const [templateId, setTemplateId] = useState<ReceiptTemplateId>(settings.templateId)
  const [showLogo, setShowLogo] = useState(settings.showLogo)
  const [headerText, setHeaderText] = useState(settings.headerText ?? '')
  const [footerText, setFooterText] = useState(settings.footerText ?? '')

  return (
    <Card className="max-w-4xl">
      <CardHeader>
        <CardTitle>Receipts</CardTitle>
        <CardDescription>
          Choose a layout and what it shows.{' '}
          <Link
            href="/receipts/preview?print=0"
            target="_blank"
            className="inline-flex items-center gap-1 underline underline-offset-2"
          >
            Open full preview <ExternalLink className="size-3" />
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          action={(formData) => {
            formData.set('organizationId', organizationId)
            formData.set('templateId', templateId)
            formAction(formData)
          }}
          className="flex flex-col gap-5"
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
            <Label>
              Layout
              <InfoHint text={FORM_HINTS.receiptSettings.template} />
            </Label>
            <ReceiptTemplatePicker
              value={templateId}
              onChange={setTemplateId}
              branding={branding}
              showLogo={showLogo}
              headerText={headerText}
              footerText={footerText}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="receipt-header">
                Header text (optional)
                <InfoHint text={FORM_HINTS.receiptSettings.headerText} />
              </Label>
              <Input
                id="receipt-header"
                name="headerText"
                value={headerText}
                onChange={(event) => setHeaderText(event.target.value)}
                maxLength={200}
                placeholder="Thank you for shopping with us"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="receipt-footer">
                Footer text (optional)
                <InfoHint text={FORM_HINTS.receiptSettings.footerText} />
              </Label>
              <Input
                id="receipt-footer"
                name="footerText"
                value={footerText}
                onChange={(event) => setFooterText(event.target.value)}
                maxLength={200}
                placeholder="All sales are final after 7 days"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="receipt-show-logo">
                Show logo
                <InfoHint text={FORM_HINTS.receiptSettings.showLogo} />
              </Label>
              <Switch
                id="receipt-show-logo"
                name="showLogo"
                checked={showLogo}
                onCheckedChange={setShowLogo}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="receipt-show-cashier">
                Show cashier name
                <InfoHint text={FORM_HINTS.receiptSettings.showCashier} />
              </Label>
              <Switch
                id="receipt-show-cashier"
                name="showCashier"
                defaultChecked={settings.showCashier}
              />
            </div>
          </div>

          <Button type="submit" disabled={pending} className="self-start">
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
