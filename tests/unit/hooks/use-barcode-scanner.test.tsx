import { fireEvent, render, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isScanCaptureBlocked, useBarcodeScanner } from '@/hooks/use-barcode-scanner'

/**
 * Milestone 14's Testing Requirement: "simulated rapid-keystroke-plus-Enter
 * input correctly adds a product via barcode lookup... without requiring
 * physical scanner hardware in CI."
 *
 * The heuristic reads Date.now(), which vi.useFakeTimers() controls — so a
 * "fast burst" and a "slow human" differ here only in how far the clock is
 * advanced between keystrokes, with no real waiting and no flakiness.
 */

const BARCODE = '5901234123457'

function typeBurst(barcode: string, gapMs: number, target: Node = document) {
  for (const char of barcode) {
    fireEvent.keyDown(target, { key: char })
    vi.advanceTimersByTime(gapMs)
  }
  fireEvent.keyDown(target, { key: 'Enter' })
}

describe('useBarcodeScanner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires on a fast burst terminated by Enter', () => {
    const onScan = vi.fn()
    renderHook(() => useBarcodeScanner({ onScan }))

    typeBurst(BARCODE, 10)

    expect(onScan).toHaveBeenCalledExactlyOnceWith(BARCODE)
  })

  it('ignores the same characters typed at human speed', () => {
    const onScan = vi.fn()
    renderHook(() => useBarcodeScanner({ onScan }))

    typeBurst(BARCODE, 200)

    expect(onScan).not.toHaveBeenCalled()
  })

  it('ignores a burst shorter than minLength', () => {
    const onScan = vi.fn()
    renderHook(() => useBarcodeScanner({ onScan, minLength: 4 }))

    typeBurst('12', 10)

    expect(onScan).not.toHaveBeenCalled()
  })

  it('fires for two consecutive scans', () => {
    const onScan = vi.fn()
    renderHook(() => useBarcodeScanner({ onScan }))

    typeBurst(BARCODE, 10)
    vi.advanceTimersByTime(500)
    typeBurst('4006381333931', 10)

    expect(onScan).toHaveBeenCalledTimes(2)
    expect(onScan).toHaveBeenNthCalledWith(2, '4006381333931')
  })

  it('does not fire while focus is in a text input', () => {
    const onScan = vi.fn()
    renderHook(() => useBarcodeScanner({ onScan }))
    const { getByRole } = render(<input aria-label="search" />)

    typeBurst(BARCODE, 10, getByRole('textbox'))

    expect(onScan).not.toHaveBeenCalled()
  })

  it('does not fire inside an open dialog', () => {
    const onScan = vi.fn()
    renderHook(() => useBarcodeScanner({ onScan }))
    const { getByTestId } = render(
      <div role="dialog">
        <span data-testid="inside-dialog">Checkout</span>
      </div>,
    )

    typeBurst(BARCODE, 10, getByTestId('inside-dialog'))

    expect(onScan).not.toHaveBeenCalled()
  })

  it('resets the buffer on a non-printable key mid-burst', () => {
    const onScan = vi.fn()
    renderHook(() => useBarcodeScanner({ onScan }))

    fireEvent.keyDown(document, { key: '5' })
    vi.advanceTimersByTime(10)
    fireEvent.keyDown(document, { key: '9' })
    vi.advanceTimersByTime(10)
    fireEvent.keyDown(document, { key: 'Tab' })
    vi.advanceTimersByTime(10)
    fireEvent.keyDown(document, { key: '0' })
    fireEvent.keyDown(document, { key: 'Enter' })

    expect(onScan).not.toHaveBeenCalled()
  })

  it('stops listening once disabled', () => {
    const onScan = vi.fn()
    const { rerender } = renderHook(({ enabled }) => useBarcodeScanner({ onScan, enabled }), {
      initialProps: { enabled: true },
    })

    rerender({ enabled: false })
    typeBurst(BARCODE, 10)

    expect(onScan).not.toHaveBeenCalled()
  })
})

describe('isScanCaptureBlocked', () => {
  it.each([
    ['input', document.createElement('input'), true],
    ['textarea', document.createElement('textarea'), true],
    ['select', document.createElement('select'), true],
    ['div', document.createElement('div'), false],
    ['button', document.createElement('button'), false],
  ])('%s → %s', (_label, element, expected) => {
    expect(isScanCaptureBlocked(element)).toBe(expected)
  })

  it('is false for a null target', () => {
    expect(isScanCaptureBlocked(null)).toBe(false)
  })

  it('is true for a contenteditable element', () => {
    const element = document.createElement('div')
    element.contentEditable = 'true'
    // jsdom does not derive isContentEditable from the attribute.
    Object.defineProperty(element, 'isContentEditable', { value: true })
    expect(isScanCaptureBlocked(element)).toBe(true)
  })
})
