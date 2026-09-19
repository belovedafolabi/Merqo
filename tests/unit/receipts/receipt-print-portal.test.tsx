import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { printReceiptViaIframe } from '@/components/receipts/receipt-print-portal'

/**
 * Receipt printing loads /print/receipt/[saleId] into a hidden iframe that
 * prints itself — the host document is never part of the print, which is what
 * fixes the "print shows the whole POS" bug on Android tablets. jsdom won't
 * navigate the iframe, so these assert on the element it creates and simulate
 * its `load` event.
 */

const FRAME_ID = 'merqo-receipt-print-frame'
const frame = () => document.getElementById(FRAME_ID) as HTMLIFrameElement | null

describe('printReceiptViaIframe', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    frame()?.remove()
  })

  it('appends one hidden iframe pointed at the print route', () => {
    printReceiptViaIframe('sale-123')

    const el = frame()
    expect(el).not.toBeNull()
    expect(el!.parentElement).toBe(document.body)
    expect(el!.getAttribute('src')).toBe('/print/receipt/sale-123')
    // never display:none — some engines refuse to print such a frame
    expect(el!.style.display).not.toBe('none')
    expect(el!.getAttribute('aria-hidden')).toBe('true')
  })

  it('URL-encodes the sale id and appends template / paper overrides', () => {
    printReceiptViaIframe('a/b 1', { templateId: 'compact', paperMm: 58 })
    expect(frame()!.getAttribute('src')).toBe(
      '/print/receipt/a%2Fb%201?templateId=compact&paper=58',
    )
  })

  it('reuses one frame across repeat clicks instead of stacking', () => {
    printReceiptViaIframe('sale-1')
    printReceiptViaIframe('sale-2')

    expect(document.querySelectorAll(`#${FRAME_ID}`)).toHaveLength(1)
    expect(frame()!.getAttribute('src')).toBe('/print/receipt/sale-2')
  })

  it('calls onDone once the frame loads', () => {
    const onDone = vi.fn()
    printReceiptViaIframe('sale-1', undefined, onDone)

    expect(onDone).not.toHaveBeenCalled()
    frame()!.dispatchEvent(new Event('load'))
    expect(onDone).toHaveBeenCalledTimes(1)

    // the fallback timer must not fire it a second time
    vi.advanceTimersByTime(15_000)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('calls onDone via the fallback timer if load never fires', () => {
    const onDone = vi.fn()
    printReceiptViaIframe('sale-1', undefined, onDone)

    vi.advanceTimersByTime(10_000)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('removes the frame ~60s after it loads', () => {
    printReceiptViaIframe('sale-1')
    frame()!.dispatchEvent(new Event('load'))
    expect(frame()).not.toBeNull()

    vi.advanceTimersByTime(60_000)
    expect(frame()).toBeNull()
  })
})
