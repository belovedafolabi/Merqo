'use client'

import { useEffect, useSyncExternalStore } from 'react'
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
 * `onDone` fires only once the print UI is genuinely gone — i.e. after the
 * window regains focus, not on bare `afterprint`. Chromium fires `afterprint`
 * while the print preview is still on screen; tearing down there (removing the
 * isolation class, unmounting the portalled receipt) let Chrome re-compose the
 * preview from the now-unhidden page — the whole POS, checkout drawer on top.
 * That was the "print shows the checkout drawer" bug.
 *
 * The isolation class is added and removed by <ReceiptPrintPortal>'s own
 * `beforeprint`/`afterprint` handlers, so a native Ctrl+P is covered too; this
 * function only triggers the print and defers `onDone` until it is safe.
 */
export function printReceiptInPlace(onDone?: () => void): void {
  let settled = false
  const timers: ReturnType<typeof setTimeout>[] = []

  function settle() {
    if (settled) return
    settled = true
    window.removeEventListener('afterprint', onAfterPrint)
    window.removeEventListener('focus', settle)
    timers.forEach(clearTimeout)
    onDone?.()
  }

  function onAfterPrint() {
    // Chrome/Edge fire this with the preview still visible. Wait for the
    // window to regain focus (dialog really dismissed); a short backstop
    // covers engines where the focus event doesn't arrive cleanly.
    if (document.hasFocus()) {
      settle()
    } else {
      window.addEventListener('focus', settle, { once: true })
      timers.push(setTimeout(settle, 1_500))
    }
  }

  window.addEventListener('afterprint', onAfterPrint)
  // Engines that never fire `afterprint` (older WebKit): the window regaining
  // focus after the dialog closes is the fallback signal.
  window.addEventListener('focus', settle, { once: true })
  // Hard cap if nothing fires at all, so the caller's button never sticks.
  timers.push(setTimeout(settle, 60_000))

  // Belt and braces: <ReceiptPrintPortal>'s `beforeprint` handler also adds
  // this, but add it here too in case the print is composed before that
  // listener's event loop turn.
  document.body.classList.add(RECEIPT_PRINTING_CLASS)
  window.print()
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
}: {
  sale: Sale
  templateId: ReceiptTemplateId
  branding: Pick<OrganizationBranding, 'displayName' | 'logoUrl'> | null
  settings: Pick<
    ReceiptSettings,
    'headerText' | 'footerText' | 'showLogo' | 'showCashier' | 'orgAddressLine' | 'orgContactPhone'
  >
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

  // Own the isolation class for the whole time this print copy is mounted, so
  // a native Ctrl/Cmd+P prints the receipt too (nothing else adds the class).
  // Removal is deferred to the next focus after `afterprint` — Chrome keeps
  // the preview on screen after `afterprint` and re-composing it without the
  // class would show the whole POS.
  useEffect(() => {
    function onBeforePrint() {
      document.body.classList.add(RECEIPT_PRINTING_CLASS)
    }
    function removeClass() {
      document.body.classList.remove(RECEIPT_PRINTING_CLASS)
    }
    function onAfterPrint() {
      if (document.hasFocus()) removeClass()
      else window.addEventListener('focus', removeClass, { once: true })
    }
    window.addEventListener('beforeprint', onBeforePrint)
    window.addEventListener('afterprint', onAfterPrint)
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint)
      window.removeEventListener('afterprint', onAfterPrint)
      window.removeEventListener('focus', removeClass)
      document.body.classList.remove(RECEIPT_PRINTING_CLASS)
    }
  }, [])

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
      />
    </div>,
    document.body,
  )
}
