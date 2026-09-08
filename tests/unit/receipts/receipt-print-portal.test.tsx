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
 * bare `afterprint` event, which Chrome/Edge fire while the print preview is
 * still on screen. Removing the isolation class and unmounting the portalled
 * receipt there let Chrome re-compose the preview from the un-hidden page.
 *
 * These assert the fix: the class is added for the print, and it survives
 * `afterprint` until the window actually regains focus.
 */

const settings = {
  headerText: null,
  footerText: null,
  showLogo: true,
  showCashier: true,
  orgAddressLine: null,
  orgContactPhone: null,
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
    vi.spyOn(window, 'print').mockImplementation(() => {})
  })

  afterEach(() => {
    // Drain any pending one-shot `focus` listeners left by a test that only
    // dispatched `afterprint`, so invocations don't bleed across tests.
    window.dispatchEvent(new Event('focus'))
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

    expect(document.body.classList.contains(RECEIPT_PRINTING_CLASS)).toBe(false)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('settles immediately when afterprint arrives with the window already focused', () => {
    renderPortal()
    const onDone = vi.fn()
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)

    printReceiptInPlace(onDone)
    window.dispatchEvent(new Event('afterprint'))

    expect(onDone).toHaveBeenCalledTimes(1)
    expect(document.body.classList.contains(RECEIPT_PRINTING_CLASS)).toBe(false)
  })

  it('a native beforeprint (Ctrl+P) applies the isolation class too', () => {
    renderPortal()
    expect(document.body.classList.contains(RECEIPT_PRINTING_CLASS)).toBe(false)

    window.dispatchEvent(new Event('beforeprint'))
    expect(document.body.classList.contains(RECEIPT_PRINTING_CLASS)).toBe(true)
  })
})
