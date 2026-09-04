'use client'

import { useEffect } from 'react'

import { ReceiptDocument } from '@/components/receipts/receipt-document'
import type { OrganizationBranding } from '@/lib/branding/queries'
import type { ReceiptSettings } from '@/lib/receipts/settings'
import type { ReceiptPaperWidthMm, ReceiptTemplateId } from '@/lib/receipts/templates'
import type { Sale } from '@/lib/sales/queries'

/**
 * Auto-print wrapper for the receipt preview route — same `?print=1` opt-in
 * pattern as components/reports/print-report.tsx, and the same reasoning:
 * arriving here from a bookmark or a shared link should render and wait, not
 * ambush the visitor with a modal print dialog.
 */
export function ReceiptPrintFrame({
  sale,
  templateId,
  branding,
  settings,
  receiptLabel,
  autoPrint,
  paperWidthMm,
}: {
  sale: Sale
  templateId: ReceiptTemplateId
  branding: Pick<OrganizationBranding, 'displayName' | 'logoUrl'> | null
  settings: ReceiptSettings
  receiptLabel?: string
  autoPrint: boolean
  paperWidthMm: ReceiptPaperWidthMm
}) {
  useEffect(() => {
    if (!autoPrint) return
    const timer = setTimeout(() => window.print(), 300)
    return () => clearTimeout(timer)
  }, [autoPrint])

  return (
    <div className="flex min-h-screen flex-col items-center gap-6 bg-muted/30 p-8 print:bg-white print:p-0">
      {/*
        `size: <width>mm auto` is the rule that makes this work on a thermal
        printer: a receipt roll is continuous, so the width is fixed and the
        length is whatever the content needs. Milestone 14's Technical
        Requirement is explicit that printing reuses this existing view via a
        print stylesheet rather than a second rendering implementation.

        The 3mm margin replaces an 8mm one that predated any paper-width
        awareness — on a 58mm roll that was giving away more than a quarter of
        the usable width to whitespace.
      */}
      <style>{`
        @media print {
          @page { size: ${paperWidthMm}mm auto; margin: 3mm; }
          html, body { background: white; margin: 0; }
        }
      `}</style>
      <ReceiptDocument
        sale={sale}
        templateId={templateId}
        branding={branding}
        settings={settings}
        receiptLabel={receiptLabel}
      />
    </div>
  )
}
