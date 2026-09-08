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
 * `onDone` fires only once the print UI is genuinely gone — after the window
 * regains focus, never straight off `afterprint`. Chromium fires `afterprint`
 * while the print preview is still on screen; tearing down there (removing the
 * isolation class, unmounting the portalled receipt) let Chrome re-compose the
 * preview from the now-unhidden page — the whole POS, checkout drawer on top.
 * That was the "print shows the checkout drawer" bug.
 *
 * Mobile WebKit / Chrome often never fire `afterprint` at all, so an earlier
 * version's unconditional `focus`→settle listener ran mid-compose on phones &
 * tablets and tore the isolation down too — the same bug, one platform over.
 * The reliable cross-engine signal is the `print` media query flipping back to
 * non-matching; `afterprint` and a 60s cap are kept as fallbacks. A short
 * delay after the signal lets the engine finish rasterising the receipt-only
 * page before the portal unmounts and the POS repaints.
 *
 * The isolation class is added and removed by <ReceiptPrintPortal>'s own
 * handlers, so a native Ctrl/Cmd+P is covered too; this function only triggers
 * the print and defers `onDone` until it is safe.
 */
export function printReceiptInPlace(onDone?: () => void): void {
  let settled = false
  const timers: ReturnType<typeof setTimeout>[] = []
  const printMql = typeof window.matchMedia === 'function' ? window.matchMedia('print') : null

  function cleanup() {
    window.removeEventListener('afterprint', onAfterPrint)
    window.removeEventListener('focus', onFocusSettle)
    printMql?.removeEventListener?.('change', onMediaChange)
    timers.forEach(clearTimeout)
  }

  function settle() {
    if (settled) return
    settled = true
    cleanup()
    // Give the engine a beat to finish composing the (receipt-only) page
    // before onDone closes the drawer and repaints the POS behind it.
    timers.push(setTimeout(() => onDone?.(), 150))
  }

  function onFocusSettle() {
    settle()
  }

  // The dialog is really gone once the window has focus again. Wait for it,
  // with a short backstop for engines where `focus` doesn't arrive cleanly.
  function armSettle() {
    if (settled) return
    if (document.hasFocus()) {
      settle()
    } else {
      window.addEventListener('focus', onFocusSettle, { once: true })
      timers.push(setTimeout(settle, 1_500))
    }
  }

  function onAfterPrint() {
    armSettle()
  }

  function onMediaChange(event: MediaQueryListEvent) {
    if (!event.matches) armSettle()
  }

  window.addEventListener('afterprint', onAfterPrint)
  printMql?.addEventListener?.('change', onMediaChange)
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
  // Removal is deferred to the next focus after the dialog closes — Chrome
  // keeps the preview on screen after `afterprint`, and re-composing it
  // without the class would show the whole POS. `matchMedia('print')` covers
  // mobile engines that never fire `afterprint`; `removeClass` refuses to run
  // while the print surface is still matching.
  useEffect(() => {
    const printMql = typeof window.matchMedia === 'function' ? window.matchMedia('print') : null
    function addClass() {
      document.body.classList.add(RECEIPT_PRINTING_CLASS)
    }
    function removeClass() {
      if (printMql?.matches) return
      document.body.classList.remove(RECEIPT_PRINTING_CLASS)
    }
    function settleRemove() {
      if (document.hasFocus()) removeClass()
      else window.addEventListener('focus', removeClass, { once: true })
    }
    function onBeforePrint() {
      addClass()
    }
    function onAfterPrint() {
      settleRemove()
    }
    function onMediaChange(event: MediaQueryListEvent) {
      if (event.matches) addClass()
      else settleRemove()
    }
    window.addEventListener('beforeprint', onBeforePrint)
    window.addEventListener('afterprint', onAfterPrint)
    printMql?.addEventListener?.('change', onMediaChange)
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint)
      window.removeEventListener('afterprint', onAfterPrint)
      window.removeEventListener('focus', removeClass)
      printMql?.removeEventListener?.('change', onMediaChange)
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
