'use client'

/**
 * Prints a receipt without touching the live document.
 *
 * A hidden, same-origin <iframe> is pointed at /print/receipt/[saleId] — a
 * bare route (app/(print)/) that renders ONLY the receipt and auto-calls
 * `window.print()` on itself. Because the print originates inside the iframe's
 * own document, the browser prints that document; the POS page hosting the
 * iframe is never part of the print.
 *
 * This replaces an in-place approach (a portalled receipt copy + a
 * `body.printing-receipt` class that a `@media print` rule used to hide the
 * rest of the page). That could not be made reliable on Android Chrome, which
 * fires neither `beforeprint`/`afterprint` nor `matchMedia('print')` change
 * events dependably and re-lays-out the live page asynchronously when a
 * printer is chosen — by which point the isolation class had been torn down,
 * so the whole POS printed (at receipt width, from the copy's `@page` rule).
 */

const FRAME_ID = 'merqo-receipt-print-frame'

export interface PrintReceiptOptions {
  /** Override the org's saved template (whitelist-validated by the route). */
  templateId?: string
  /** Override the physical paper width the print stylesheet targets. */
  paperMm?: 58 | 80
}

/**
 * @param saleId  the completed sale to print.
 * @param opts    optional template / paper-width overrides.
 * @param onDone  fires once the print frame has loaded (or a 10s fallback) —
 *                the caller uses this to close the checkout drawer / reset the
 *                till. The iframe prints itself independently of this.
 */
export function printReceiptViaIframe(
  saleId: string,
  opts?: PrintReceiptOptions,
  onDone?: () => void,
): void {
  // Repeat clicks reuse one frame rather than stacking hidden iframes.
  document.getElementById(FRAME_ID)?.remove()

  const params = new URLSearchParams()
  if (opts?.templateId) params.set('templateId', opts.templateId)
  if (opts?.paperMm) params.set('paper', String(opts.paperMm))
  const query = params.toString()

  const iframe = document.createElement('iframe')
  iframe.id = FRAME_ID
  // Off-screen and inert, but NOT `display:none` (some engines won't print a
  // display:none frame) and non-zero size (0×0 frames are skipped too).
  iframe.setAttribute('aria-hidden', 'true')
  iframe.tabIndex = -1
  iframe.style.cssText =
    'position:fixed;left:-9999px;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;'
  iframe.src = `/print/receipt/${encodeURIComponent(saleId)}${query ? `?${query}` : ''}`

  let done = false
  const finish = () => {
    if (done) return
    done = true
    onDone?.()
  }

  iframe.addEventListener('load', () => {
    finish()
    // The route self-prints ~300ms after load; keep the frame around well
    // past that so a slow Bluetooth spool still has its source, then bin it.
    window.setTimeout(() => iframe.remove(), 60_000)
  })
  // Belt and braces: never leave the caller's button spinning if `load`
  // somehow never fires.
  window.setTimeout(finish, 10_000)

  document.body.appendChild(iframe)
}
