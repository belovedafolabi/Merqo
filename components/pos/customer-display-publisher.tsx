'use client'

import { useEffect, useMemo, useRef } from 'react'

import {
  CUSTOMER_DISPLAY_CHANNEL,
  toCustomerDisplaySnapshot,
  type CustomerDisplayMessage,
} from '@/lib/pos/customer-display'
import { useCart, useCartTotals } from '@/lib/pos/cart-context'

/**
 * Broadcasts the cart to any open customer-facing display. Renders nothing.
 *
 * Mounted from app/(pos)/layout.tsx inside CartProvider rather than living in
 * lib/pos/cart-context.tsx itself, for two reasons: the cart stays a pure,
 * jsdom-testable state container with no browser-API dependency, and "mount a
 * side-effect-only component in the shell" is already this codebase's shape
 * for exactly this (components/branding/brand-style.tsx).
 */
export function CustomerDisplayPublisher() {
  const { lines } = useCart()
  const totals = useCartTotals()
  const channelRef = useRef<BroadcastChannel | null>(null)

  const snapshot = useMemo(() => toCustomerDisplaySnapshot(lines, totals), [lines, totals])

  // A ref holds the latest snapshot so the request-snapshot listener below
  // can answer with current state without re-subscribing on every cart
  // change — which would tear down and rebuild the channel on each keystroke.
  // Kept current in the same effect that publishes it (below) rather than
  // during render, which react-hooks/refs correctly rejects: the listener
  // reads it asynchronously, on an incoming message, so post-commit is soon
  // enough.
  const snapshotRef = useRef(snapshot)

  useEffect(() => {
    // Guard rather than assume: BroadcastChannel is unavailable in jsdom
    // without a polyfill, and this component is mounted in the POS shell that
    // component tests render.
    if (typeof BroadcastChannel === 'undefined') return

    const channel = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL)
    channelRef.current = channel

    channel.onmessage = (event: MessageEvent<CustomerDisplayMessage>) => {
      if (event.data?.type !== 'request-snapshot') return
      channel.postMessage({ type: 'snapshot', snapshot: snapshotRef.current })
    }

    return () => {
      channel.onmessage = null
      channel.close()
      channelRef.current = null
    }
  }, [])

  useEffect(() => {
    snapshotRef.current = snapshot
    channelRef.current?.postMessage({ type: 'snapshot', snapshot })
  }, [snapshot])

  return null
}
