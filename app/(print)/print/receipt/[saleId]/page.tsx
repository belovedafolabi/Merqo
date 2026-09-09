import { redirect } from 'next/navigation'

import { requirePermission } from '@/lib/auth/guard'
import { getOrganizationBranding } from '@/lib/branding/queries'
import { getOnboardingState } from '@/lib/business-structure/queries'
import { getReceiptSettings } from '@/lib/receipts/settings'
import {
  DEFAULT_RECEIPT_TEMPLATE_ID,
  RECEIPT_TEMPLATE_IDS,
  RECEIPT_TEMPLATES,
  findReceiptPaperWidth,
  type ReceiptTemplateId,
} from '@/lib/receipts/templates'
import { getSale } from '@/lib/sales/queries'
import { ReceiptPrintFrame } from '@/components/receipts/receipt-print-frame'

/**
 * The isolated print target for a real receipt. Rendered into a hidden
 * same-origin iframe by printReceiptViaIframe()
 * (components/receipts/receipt-print-portal.tsx); the iframe's own
 * <ReceiptPrintFrame> auto-calls window.print() 300 ms after load, so the
 * browser prints THIS document — which contains nothing but the receipt —
 * and the live POS behind the iframe is never involved.
 *
 * Real-sale only (no SAMPLE_SALE fallback — the settings preview route
 * app/(app)/receipts/preview keeps that): gated on `sales.view`, the same
 * permission that has always covered a printed take-away copy.
 *
 * `?templateId=` / `?paper=58|80` are whitelist-validated overrides, matching
 * app/(app)/receipts/preview/page.tsx; both fall back to the org's settings.
 */
export default async function PrintReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ saleId: string }>
  searchParams: Promise<{ templateId?: string; paper?: string }>
}) {
  const { saleId } = await params
  const { templateId: requestedTemplateId, paper } = await searchParams

  const onboardingState = await getOnboardingState()
  const organizationId = onboardingState.organizationId
  if (!organizationId) redirect('/sign-in')

  await requirePermission('sales.view', { organizationId })

  const [sale, branding, settings] = await Promise.all([
    getSale(saleId),
    getOrganizationBranding(),
    getReceiptSettings(),
  ])
  if (!sale) redirect('/pos')

  const templateId: ReceiptTemplateId = (RECEIPT_TEMPLATE_IDS as readonly string[]).includes(
    requestedTemplateId ?? '',
  )
    ? (requestedTemplateId as ReceiptTemplateId)
    : (settings.templateId ?? DEFAULT_RECEIPT_TEMPLATE_ID)

  const paperWidthMm = findReceiptPaperWidth(paper) ?? RECEIPT_TEMPLATES[templateId].paperWidthMm

  return (
    <ReceiptPrintFrame
      sale={sale}
      templateId={templateId}
      branding={branding}
      settings={settings}
      autoPrint
      paperWidthMm={paperWidthMm}
    />
  )
}
