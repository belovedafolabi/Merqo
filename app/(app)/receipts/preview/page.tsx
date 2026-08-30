import { redirect } from 'next/navigation'

import { requirePermission } from '@/lib/auth/guard'
import { getOrganizationBranding } from '@/lib/branding/queries'
import { getOnboardingState, listBranches } from '@/lib/business-structure/queries'
import { getReceiptSettings } from '@/lib/receipts/settings'
import { SAMPLE_SALE } from '@/lib/receipts/sample'
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
 * The receipt preview/print route, modeled on
 * app/(app)/reports/[reportId]/print/page.tsx.
 *
 * Lives at app/(app)/receipts/preview — a sibling of app/(app)/settings/,
 * not nested under it. It still inherits app/(app)/layout.tsx's sidebar
 * shell (there is no route mechanism in this codebase to opt out of an
 * ancestor layout — the same is true of the reports print route this one is
 * modeled on), but nesting it under settings/ would have additionally
 * inherited components/settings/settings-nav.tsx's tab strip, which makes no
 * sense on a page meant to be printed or opened standalone.
 *
 * `?saleId=` renders a REAL sale (requires `sales.view`, since this is the
 * same take-away copy a printed receipt has always been — no new permission
 * needed, the underlying data was already gated). Omitted, it falls back to
 * a hard-coded SAMPLE_SALE (requires `organizations.update`, the same
 * permission that gates the settings screen this preview is launched from)
 * so the template picker and receipt editor work on a brand-new organization
 * with zero real sales yet.
 *
 * `?templateId=` lets the template picker preview a layout that is not yet
 * saved — falls back to the organization's saved setting.
 *
 * `?paper=58|80` (Milestone 14) overrides the physical paper width the print
 * stylesheet targets, for a shop whose thermal printer disagrees with the
 * width its chosen template implies. Whitelist-validated exactly like
 * `?templateId=`, and falls back to the template's own `paperWidthMm`.
 */
export default async function ReceiptPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    saleId?: string
    templateId?: string
    print?: string
    paper?: string
  }>
}) {
  const onboardingState = await getOnboardingState()
  const organizationId = onboardingState.organizationId
  if (!organizationId) redirect('/sign-in')

  const resolvedSearchParams = await searchParams
  const requestedTemplateId = resolvedSearchParams.templateId

  const [branding, settings] = await Promise.all([getOrganizationBranding(), getReceiptSettings()])

  const templateId: ReceiptTemplateId = (RECEIPT_TEMPLATE_IDS as readonly string[]).includes(
    requestedTemplateId ?? '',
  )
    ? (requestedTemplateId as ReceiptTemplateId)
    : (settings.templateId ?? DEFAULT_RECEIPT_TEMPLATE_ID)

  const paperWidthMm =
    findReceiptPaperWidth(resolvedSearchParams.paper) ?? RECEIPT_TEMPLATES[templateId].paperWidthMm

  let sale = SAMPLE_SALE
  let branchName: string | null = null

  if (resolvedSearchParams.saleId) {
    await requirePermission('sales.view', { organizationId })
    const realSale = await getSale(resolvedSearchParams.saleId)
    if (!realSale) redirect('/settings/receipts')
    sale = realSale

    const branches = await listBranches(organizationId)
    branchName = branches.find((branch) => branch.id === sale.branchId)?.name ?? null
  } else {
    await requirePermission('organizations.update', { organizationId })
  }

  return (
    <ReceiptPrintFrame
      sale={sale}
      templateId={templateId}
      branding={branding}
      settings={settings}
      branchName={branchName}
      autoPrint={resolvedSearchParams.print === '1'}
      paperWidthMm={paperWidthMm}
    />
  )
}
