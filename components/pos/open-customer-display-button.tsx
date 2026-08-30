'use client'

import { Monitor } from 'lucide-react'

import { Button } from '@/components/ui/button'

/**
 * Opens the customer-facing display in a second window (Milestone 14).
 *
 * The window NAME is what makes repeat clicks harmless: the browser reuses
 * the existing window and focuses it rather than spawning another. Same
 * technique as the receipt print popup in checkout-dialog.tsx.
 *
 * Hidden below `sm` — a phone has no second screen to put this on.
 */
export function OpenCustomerDisplayButton() {
  return (
    <Button
      variant="ghost"
      size="icon-touch"
      aria-label="Open customer display"
      title="Open customer display"
      className="hidden sm:inline-flex"
      onClick={() => {
        const display = window.open(
          '/display',
          'merqo-customer-display',
          'popup=yes,width=1024,height=768',
        )
        display?.focus()
      }}
    >
      <Monitor />
    </Button>
  )
}
