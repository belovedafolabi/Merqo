'use client'

import { useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

import { ReceiptDocument } from '@/components/receipts/receipt-document'
import type { OrganizationBranding } from '@/lib/branding/queries'
import type { ReceiptSettings } from '@/lib/receipts/settings'
import { RECEIPT_TEMPLATES, type ReceiptTemplateId } from '@/lib/receipts/templates'
import type { Sale } from '@/lib/sales/queries'

/**
 * Marks the document as printing a receipt. app/globals.css hides every
 * other top-level node while it is set, so the printout is the receipt alone
 * even though the whole POS is still mounted behind it.
 */
export const RECEIPT_PRINTING_CLASS = 'printing-receipt'

/** The portal's own root class — globals.css keys its print rules off this. */
const PORTAL_CLASS = 'receipt-print-portal'

/**
 * Prints the receipt already rendered by <ReceiptPrintPortal> without leaving
 * the page.
 *
 * Replaces a `window.open('/receipts/preview?print=1')` popup, which paid for
 * a full document load — through the (app) layout, its auth guard, its
 * sidebar and its branding query — before the print dialog could even open,
 * and which a popup blocker could swallow silently. The receipt is already on
 * screen in the checkout drawer by the time this runs, so there is nothing
 * left to fetch.
 *
 * `onDone` fires after the dialog closes. `afterprint` is the real signal,
 * but Safari has historically not fired it reliably, so a timeout backstop
 * guarantees the caller's cleanup (clearing the cart, closing the drawer)
 * still happens.
 */
export function printReceiptInPlace(onDone?: () => void): void {
  const body = document.body
  let settled = false

  function finish() {
    if (settled) return
    settled = true
    window.removeEventListener('afterprint', finish)
    clearTimeout(backstop)
    body.classList.remove(RECEIPT_PRINTING_CLASS)
    onDone?.()
  }

  const backstop = setTimeout(finish, 60_000)
  window.addEventListener('afterprint', finish)

  body.classList.add(RECEIPT_PRINTING_CLASS)
  // Let the class land before the browser snapshots the page. window.print()
  // is synchronous and blocking, so without a frame in between the printout
  // can be composed from pre-class styles.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => window.print())
  })
}

/** Never changes, so the hydration snapshot below never needs re-reading. */
const subscribeToNothing = () => () => {}

/**
 * A print-only copy of the receipt, portalled to <body>.
 *
 * A copy rather than printing the on-screen one because the on-screen receipt
 * lives inside a vaul Drawer — a fixed, transformed, portalled subtree, which
 * browsers paginate unpredictably. Rendering a second, statically-positioned
 * copy at the document root sidesteps that entirely, and it costs nothing:
 * it is `display: none` until a print actually starts.
 */
export function ReceiptPrintPortal({
  sale,
  templateId,
  branding,
  settings,
  branchName,
}: {
  sale: Sale
  templateId: ReceiptTemplateId
  branding: Pick<OrganizationBranding, 'displayName' | 'logoUrl'> | null
  settings: Pick<ReceiptSettings, 'headerText' | 'footerText' | 'showLogo' | 'showCashier'>
  branchName?: string | null
}) {
  // Portals need a DOM node, which does not exist during the server render.
  // useSyncExternalStore rather than a useState/useEffect mount flag: the
  // snapshot pair below IS "has this hydrated", and it satisfies the
  // project's react-hooks/set-state-in-effect rule by construction.
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  )
  if (!hydrated) return null

  const paperWidthMm = RECEIPT_TEMPLATES[templateId].paperWidthMm

  return createPortal(
    <div className={PORTAL_CLASS}>
      {/* Same rule as components/receipts/receipt-print-frame.tsx: a receipt
          roll is continuous, so the width is fixed and the length is
          whatever the content needs. */}
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
        branchName={branchName}
      />
    </div>,
    document.body,
  )
}
