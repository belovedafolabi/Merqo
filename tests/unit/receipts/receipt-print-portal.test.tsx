import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  RECEIPT_PRINTING_CLASS,
  ReceiptPrintPortal,
  printReceiptInPlace,
} from '@/components/receipts/receipt-print-portal'
import { SAMPLE_SALE } from '@/lib/receipts/sample'

/**
 * The "print shows the checkout drawer" regression: cleanup used to run on the
 * bare `afterprint` event (Chrome/Edge fire it while the preview is still on
 * screen) and later on an unconditional `focus` listener that, on mobile
 * WebKit / Chrome — which never fire `afterprint` — settled mid-compose.
 * Either way the isolation class dropped while the page was still being
 * rasterised and the whole POS printed.
 *
 * These assert the fix: the class is added for the print; it survives
 * `afterprint` until the window actually regains focus; the `print` media
 * query flipping back to non-matching is the cross-engine "dialog closed"
 * signal; and `onDone` is deferred a beat past that so the receipt-only page
 * finishes composing.
 */

const settings = {
  headerText: null,
  footerText: null,
  showLogo: true,
  showCashier: true,
  orgAddressLine: null,
  orgContactPhone: null,
}

// jsdom has no `matchMedia` — install a controllable `print` media query.
type MediaListener = (event: { matches: boolean }) => void
let printMediaListeners: MediaListener[] = []
let printMediaMatches = false

function installMatchMediaMock() {
  printMediaListeners = []
  printMediaMatches = false
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    get matches() {
      return query === 'print' ? printMediaMatches : false
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, cb: MediaListener) => {
      if (query === 'print') printMediaListeners.push(cb)
    },
    removeEventListener: (_type: string, cb: MediaListener) => {
      printMediaListeners = printMediaListeners.filter((l) => l !== cb)
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  }))
}

/** Simulate the print dialog opening (`true`) or closing (`false`). */
function setPrintMedia(matches: boolean) {
  printMediaMatches = matches
  for (const listener of [...printMediaListeners]) listener({ matches })
}

function renderPortal() {
  return render(
    <ReceiptPrintPortal
      sale={SAMPLE_SALE}
      templateId="classic"
      branding={{ displayName: 'Merqo Test Store', logoUrl: null }}
      settings={settings}
    />,
  )
}

describe('printReceiptInPlace', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    installMatchMediaMock()
    vi.spyOn(window, 'print').mockImplementation(() => {})
  })

  afterEach(() => {
    // Drain any pending one-shot `focus` listeners left by a test that only
    // dispatched `afterprint`, so invocations don't bleed across tests.
    window.dispatchEvent(new Event('focus'))
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    document.body.classList.remove(RECEIPT_PRINTING_CLASS)
    vi.restoreAllMocks()
  })

  it('adds the isolation class before printing', () => {
    renderPortal()
    printReceiptInPlace()
    expect(document.body.classList.contains(RECEIPT_PRINTING_CLASS)).toBe(true)
  })

  it('does not tear down on afterprint while the window is still blurred', () => {
    renderPortal()
    const onDone = vi.fn()
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)

    printReceiptInPlace(onDone)
    window.dispatchEvent(new Event('afterprint'))
    vi.advanceTimersByTime(300)

    // Preview is still on screen (no focus yet) — class must stay, onDone must wait.
    expect(document.body.classList.contains(RECEIPT_PRINTING_CLASS)).toBe(true)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('tears down once the window regains focus after printing', () => {
    renderPortal()
    const onDone = vi.fn()
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)

    printReceiptInPlace(onDone)
    window.dispatchEvent(new Event('afterprint'))
    window.dispatchEvent(new Event('focus'))
    vi.advanceTimersByTime(300)

    expect(document.body.classList.contains(RECEIPT_PRINTING_CLASS)).toBe(false)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('settles immediately when afterprint arrives with the window already focused', () => {
    renderPortal()
    const onDone = vi.fn()
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)

    printReceiptInPlace(onDone)
    window.dispatchEvent(new Event('afterprint'))
    vi.advanceTimersByTime(300)

    expect(onDone).toHaveBeenCalledTimes(1)
    expect(document.body.classList.contains(RECEIPT_PRINTING_CLASS)).toBe(false)
  })

  it('settles on the print media query closing when afterprint never fires (mobile)', () => {
    renderPortal()
    const onDone = vi.fn()
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)

    printReceiptInPlace(onDone)
    setPrintMedia(true) // dialog opens
    // No `afterprint`, no `focus` — only the media query flips back.
    expect(document.body.classList.contains(RECEIPT_PRINTING_CLASS)).toBe(true)
    expect(onDone).not.toHaveBeenCalled()

    setPrintMedia(false) // dialog closes
    vi.advanceTimersByTime(300)

    expect(onDone).toHaveBeenCalledTimes(1)
    expect(document.body.classList.contains(RECEIPT_PRINTING_CLASS)).toBe(false)
  })

  it('keeps the isolation class while the print media query is still matching', () => {
    renderPortal()
    const onDone = vi.fn()
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)

    printReceiptInPlace(onDone)
    setPrintMedia(true)
    // A stray focus while the preview is genuinely still up must not tear down.
    window.dispatchEvent(new Event('focus'))
    vi.advanceTimersByTime(300)

    expect(document.body.classList.contains(RECEIPT_PRINTING_CLASS)).toBe(true)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('a native beforeprint (Ctrl+P) applies the isolation class too', () => {
    renderPortal()
    expect(document.body.classList.contains(RECEIPT_PRINTING_CLASS)).toBe(false)

    window.dispatchEvent(new Event('beforeprint'))
    expect(document.body.classList.contains(RECEIPT_PRINTING_CLASS)).toBe(true)
  })
})
