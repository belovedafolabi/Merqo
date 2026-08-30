'use client'

import { useEffect, useRef } from 'react'

import { logger } from '@/lib/logger'

/**
 * Document-level barcode capture for the POS, per
 * docs/milestones/14-hardware-integration-and-pos-ux.md's Technical
 * Requirements: "standard DOM keyboard-event listening with a heuristic
 * (input speed/pattern plus a terminating Enter) distinguishing scanner
 * bursts from manual typing — no vendor-specific WebHID/WebUSB integration".
 *
 * Almost every USB/Bluetooth barcode scanner presents as a keyboard, so
 * there is nothing to integrate with: a scan is simply a burst of keystrokes
 * followed by Enter, arriving far faster than a human can type. The only
 * real problems are (a) telling that burst apart from ordinary typing and
 * (b) catching it when focus is not in the search box — which is the common
 * case in practice, since a cashier clicks a product tile or the cart and
 * then scans the next item without clicking back.
 *
 * components/pos/pos-search.tsx keeps its own Enter handler and remains the
 * sole handler whenever the search input has focus (see the INPUT rule in
 * isScanCaptureBlocked); this hook is the safety net for everywhere else, so
 * the two never both fire for one scan.
 *
 * Not supported in v1, deliberately: a Tab terminator (some scanners can be
 * configured to send one) and prefix/suffix protocols such as a leading `~`.
 * Both are one-line additions once a real device is known to need them; both
 * are guesses today.
 */

export interface BarcodeScannerOptions {
  /** Called with the buffered characters when a burst is recognised as a scan. */
  onScan: (barcode: string) => void
  /** Default true — pass false to suspend capture without unmounting. */
  enabled?: boolean
  /** Shortest burst treated as a barcode. Default 4. */
  minLength?: number
  /** Largest gap allowed between two keystrokes of one burst, in ms. Default 50. */
  maxInterKeyMs?: number
}

const DEFAULT_MIN_LENGTH = 4
const DEFAULT_MAX_INTER_KEY_MS = 50

/**
 * Whether a keystroke belongs to something other than the till's ambient
 * "nothing focused" state, and must therefore be left alone.
 *
 * The `[role="dialog"]` clause carries most of the weight: Radix renders
 * that role on DialogContent and vaul on DrawerContent, and both trap focus
 * while open. So the checkout dialog, the customer picker inside it, the
 * quick-add customer form and the mobile cart drawer are all covered by one
 * rule — no `checkoutOpen` prop threading, no scanner context, and no way
 * for a new dialog to be added later and silently miss the guard.
 */
export function isScanCaptureBlocked(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return target.closest('[role="dialog"], [role="alertdialog"]') !== null
}

export function useBarcodeScanner({
  onScan,
  enabled = true,
  minLength = DEFAULT_MIN_LENGTH,
  maxInterKeyMs = DEFAULT_MAX_INTER_KEY_MS,
}: BarcodeScannerOptions): void {
  // A ref, never state: a 13-character scan arrives as 13 keydown events in
  // ~130ms, and holding the buffer in state would re-render the entire POS
  // screen 13 times for one scan.
  const buffer = useRef({ chars: '', startedAt: 0, lastKeyAt: 0 })

  // Keeps the listener registration from depending on a caller's inline
  // arrow function, which would otherwise tear down and re-add the document
  // listener on every render of the consuming component.
  const onScanRef = useRef(onScan)
  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    if (!enabled) return

    function handleKeyDown(event: KeyboardEvent) {
      // Date.now(), not performance.now(): vitest's fake timers mock it, and
      // that is what makes this heuristic testable in jsdom with no hardware.
      const now = Date.now()
      const current = buffer.current

      if (event.ctrlKey || event.metaKey || event.altKey) {
        current.chars = ''
        return
      }

      if (event.key === 'Enter') {
        const { chars, startedAt } = current
        current.chars = ''
        if (chars.length < minLength) return

        // Only report a rejection for something that plausibly looked like a
        // code. Without the length check above this would fire on every
        // ordinary Enter press anywhere in the POS.
        if (isScanCaptureBlocked(event.target)) {
          logger.debug('pos.scan_rejected', {
            reason: 'blocked_target',
            length: chars.length,
            elapsedMs: now - startedAt,
          })
          return
        }

        // The terminating Enter would otherwise activate whatever button or
        // link happens to hold focus.
        event.preventDefault()
        logger.debug('pos.scan_detected', {
          length: chars.length,
          elapsedMs: now - startedAt,
        })
        onScanRef.current(chars)
        return
      }

      // Any non-printable key (Tab, Escape, arrows, F-keys…) means this was
      // not an uninterrupted scanner burst.
      if (event.key.length !== 1) {
        current.chars = ''
        return
      }

      if (now - current.lastKeyAt > maxInterKeyMs) {
        // Too slow to be part of the previous burst — start a new one. This
        // single rule is the whole speed heuristic: a buffer that survives to
        // minLength is guaranteed to have had EVERY gap under the threshold,
        // which no human sustains across four or more characters.
        if (current.chars.length >= minLength) {
          logger.debug('pos.scan_rejected', {
            reason: 'too_slow',
            length: current.chars.length,
            elapsedMs: now - current.startedAt,
          })
        }
        current.chars = event.key
        current.startedAt = now
      } else {
        current.chars += event.key
      }
      current.lastKeyAt = now
    }

    // Bubble phase, not capture: an input's own onKeyDown has already run by
    // then, so declining via isScanCaptureBlocked cannot steal a keystroke
    // the focused field was going to handle.
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [enabled, minLength, maxInterKeyMs])
}
