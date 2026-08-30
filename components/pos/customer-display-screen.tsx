'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

import { logger } from '@/lib/logger'
import {
  CUSTOMER_DISPLAY_CHANNEL,
  CUSTOMER_DISPLAY_PROTOCOL_VERSION,
  type CustomerDisplayMessage,
  type CustomerDisplaySnapshot,
} from '@/lib/pos/customer-display'

/**
 * The customer-facing screen: a read-only mirror of the cart, sized to be
 * legible across a counter.
 *
 * Renders ZERO interactive elements — no button, link, input, select or
 * textarea anywhere in this file. That is the milestone's Security
 * Requirement ("it must not, for example, allow completing a sale") expressed
 * structurally rather than by permission check, and
 * tests/e2e/authenticated/customer-display.spec.ts asserts the count is zero
 * so it stays that way.
 *
 * What it may show is decided upstream by toCustomerDisplaySnapshot's return
 * type — this component can only render what it is handed.
 */

function currency(value: number): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(value)
}

export function CustomerDisplayScreen({
  displayName,
  logoUrl,
}: {
  displayName: string
  logoUrl: string | null
}) {
  const [snapshot, setSnapshot] = useState<CustomerDisplaySnapshot | null>(null)

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return

    const channel = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL)

    channel.onmessage = (event: MessageEvent<CustomerDisplayMessage>) => {
      const message = event.data
      if (message?.type !== 'snapshot') return
      if (message.snapshot.v !== CUSTOMER_DISPLAY_PROTOCOL_VERSION) {
        logger.warn('pos.display_protocol_mismatch', {
          received: message.snapshot.v,
          expected: CUSTOMER_DISPLAY_PROTOCOL_VERSION,
        })
        return
      }
      setSnapshot(message.snapshot)
    }

    // The replay handshake — see the request-snapshot doc comment in
    // lib/pos/customer-display.ts. Without it, a display opened mid-sale sits
    // on the welcome screen until the cashier's next action.
    channel.postMessage({ type: 'request-snapshot' })

    return () => {
      channel.onmessage = null
      channel.close()
    }
  }, [])

  const hasItems = snapshot !== null && snapshot.lines.length > 0

  return (
    <main className="flex min-h-dvh flex-col bg-background p-8 text-foreground">
      <header className="flex items-center gap-4 border-b pb-6">
        {logoUrl ? (
          <Image src={logoUrl} alt="" width={64} height={64} className="size-16 object-contain" />
        ) : null}
        <h1 className="text-h2 font-semibold">{displayName}</h1>
      </header>

      {!hasItems ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-display font-semibold">Welcome</p>
          <p className="text-h4 text-muted-foreground">Your items will appear here.</p>
        </div>
      ) : (
        <>
          {/* aria-live so a screen reader following along announces additions
              — this screen never receives focus, so nothing else would. */}
          <ul className="flex-1 divide-y overflow-y-auto py-4" aria-live="polite">
            {snapshot.lines.map((line) => (
              <li key={line.key} className="flex items-baseline justify-between gap-6 py-4">
                <span className="min-w-0 flex-1 truncate text-h4">{line.name}</span>
                <span className="text-h4 text-muted-foreground tabular-nums">×{line.quantity}</span>
                <span className="text-h4 font-medium tabular-nums">{currency(line.lineTotal)}</span>
              </li>
            ))}
          </ul>

          <footer className="border-t pt-6">
            <dl className="ml-auto flex w-full max-w-md flex-col gap-2">
              <SummaryRow label="Subtotal" value={snapshot.subtotal} />
              {snapshot.discountAmount > 0 ? (
                // The AMOUNT only. The reason a discount was given is
                // internal and never crosses the wire.
                <SummaryRow label="Discount" value={-snapshot.discountAmount} />
              ) : null}
              {snapshot.serviceChargeAmount > 0 ? (
                <SummaryRow label="Service charge" value={snapshot.serviceChargeAmount} />
              ) : null}
              {snapshot.taxAmount > 0 ? (
                <SummaryRow label="Tax" value={snapshot.taxAmount} />
              ) : null}
              <div className="mt-2 flex items-baseline justify-between border-t pt-4">
                <dt className="text-h3 font-semibold">Total</dt>
                <dd className="text-display font-semibold tabular-nums">
                  {currency(snapshot.total)}
                </dd>
              </div>
            </dl>
          </footer>
        </>
      )}
    </main>
  )
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-h4 text-muted-foreground">{label}</dt>
      <dd className="text-h4 tabular-nums">{currency(value)}</dd>
    </div>
  )
}
