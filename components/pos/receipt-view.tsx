'use client'

import { useEffect, useState } from 'react'

import { getReceiptContextAction, getSaleAction } from '@/app/(pos)/pos/actions'
import { ReceiptDocument } from '@/components/receipts/receipt-document'
import { DEFAULT_RECEIPT_TEMPLATE_ID } from '@/lib/receipts/templates'
import type { OrganizationBranding } from '@/lib/branding/queries'
import type { ReceiptSettings } from '@/lib/receipts/settings'
import type { Sale } from '@/lib/sales/queries'

/**
 * Digital receipt — this milestone's Scope: "Receipt generation (digital;
 * print output specifics are Milestone 14's hardware scope, but the receipt
 * *data model/template rendering* is built here)". Fetches straight from
 * lib/sales/queries.ts's getSale() — the same rows the sale itself was
 * written from, never a recomputation, so the receipt can never drift from
 * what was actually charged.
 *
 * Milestone 11: rendering itself is delegated to
 * components/receipts/receipt-document.tsx, the same component the settings
 * preview route and template picker use — this file's only remaining job is
 * fetching the sale plus the organization's branding/receipt-settings
 * (via getReceiptContextAction(), a Server Action — this component is a
 * client leaf inside checkout-drawer.tsx, which cannot reach next/headers
 * directly).
 */
export function ReceiptView({
  saleId,
  onReady,
}: {
  saleId: string
  /** Fires once the sale has loaded and the receipt (incl. its print copy) is
   *  rendered — the caller gates "Print receipt" on this to avoid printing a
   *  blank page. */
  onReady?: () => void
}) {
  const [sale, setSale] = useState<Sale | null>(null)
  const [branding, setBranding] = useState<OrganizationBranding | null>(null)
  const [settings, setSettings] = useState<ReceiptSettings | null>(null)

  useEffect(() => {
    getSaleAction(saleId).then((loaded) => {
      setSale(loaded)
      if (loaded) onReady?.()
    })
    getReceiptContextAction().then(({ branding, settings }) => {
      setBranding(branding)
      setSettings(settings)
    })
    // onReady is a stable inline callback from the parent; re-running on its
    // identity would refetch the sale for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleId])

  if (!sale) {
    return <p className="text-body-sm text-muted-foreground">Loading receipt…</p>
  }

  const templateId = settings?.templateId ?? DEFAULT_RECEIPT_TEMPLATE_ID
  const resolvedSettings = settings ?? {
    headerText: null,
    footerText: null,
    showLogo: true,
    showCashier: true,
    orgAddressLine: null,
    orgContactPhone: null,
  }

  // The visible in-drawer preview. Printing is handled separately by
  // printReceiptViaIframe() (checkout-drawer.tsx), which loads the receipt
  // into its own isolated document — nothing to render here for that.
  return (
    <ReceiptDocument
      sale={sale}
      templateId={templateId}
      branding={branding}
      settings={resolvedSettings}
    />
  )
}
