'use client'

import { useEffect } from 'react'

import { ReceiptDocument } from '@/components/receipts/receipt-document'
import type { OrganizationBranding } from '@/lib/branding/queries'
import type { ReceiptSettings } from '@/lib/receipts/settings'
import type { ReceiptTemplateId } from '@/lib/receipts/templates'
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
  branchName,
  autoPrint,
}: {
  sale: Sale
  templateId: ReceiptTemplateId
  branding: Pick<OrganizationBranding, 'displayName' | 'logoUrl'> | null
  settings: ReceiptSettings
  branchName?: string | null
  autoPrint: boolean
}) {
  useEffect(() => {
    if (!autoPrint) return
    const timer = setTimeout(() => window.print(), 300)
    return () => clearTimeout(timer)
  }, [autoPrint])

  return (
    <div className="flex min-h-screen flex-col items-center gap-6 bg-muted/30 p-8 print:bg-white print:p-0">
      <style>{`
        @media print {
          @page { margin: 8mm; }
          body { background: white; }
        }
      `}</style>
      <ReceiptDocument
        sale={sale}
        templateId={templateId}
        branding={branding}
        settings={settings}
        branchName={branchName}
      />
    </div>
  )
}
