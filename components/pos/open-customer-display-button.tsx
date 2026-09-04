'use client'

import { Monitor } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Opens (or focuses) the customer-facing display window. Named, so repeat
 *  calls reuse the one window rather than spawning another. */
export function openCustomerDisplay(): void {
  window.open('/display', 'merqo-customer-display', 'popup=yes,width=1024,height=768')?.focus()
}

/**
 * Opens the customer-facing display in a second window (Milestone 14).
 *
 * Two shapes from one component: the compact icon button in the POS header
 * (default), and a full-width labelled row inside the POS menu sheet
 * (`label` set — Milestone 17 Part D). The header form is hidden below `sm`
 * (a phone has no second screen); the sheet form passes its own `className`
 * to opt out of that.
 */
export function OpenCustomerDisplayButton({
  label,
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <Button
      variant="ghost"
      size={label ? 'default' : 'icon-touch'}
      aria-label={label ? undefined : 'Open customer display'}
      title={label ? undefined : 'Open customer display'}
      className={cn(
        // The header form hides below `sm` (a phone has no second screen);
        // the labelled sheet form is always shown.
        !label && !className && 'hidden sm:inline-flex',
        label && 'w-full justify-start gap-2',
        className,
      )}
      onClick={openCustomerDisplay}
    >
      <Monitor className={label ? 'size-4' : undefined} />
      {label}
    </Button>
  )
}
