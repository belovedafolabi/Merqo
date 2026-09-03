'use client'

import { Info } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

const TRIGGER_CLASS =
  'inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'

const CONTENT_CLASS = 'max-w-64 text-pretty'

/**
 * A small "?" affordance next to a form field's label that explains what the
 * field is for.
 *
 * Two presentations, picked by input capability:
 *  - Pointer devices get a Radix Tooltip (hover + keyboard focus).
 *  - Touch devices get a Radix Popover instead — Tooltip dismisses on
 *    `pointerdown`, so a tap never showed anything. Popover toggles on tap and
 *    dismisses on outside-tap / Esc, which is the mobile-correct behaviour.
 *
 * Both render the exact same `<button>` trigger and the same copy, so call
 * sites stay `<InfoHint text="…" />` inside a <Label> with nothing else to do.
 */
export function InfoHint({ text, className }: { text: string; className?: string }) {
  const isMobile = useIsMobile()

  const trigger = (
    <button type="button" aria-label="About this field" className={cn(TRIGGER_CLASS, className)}>
      <Info className="size-3.5" />
    </button>
  )

  if (isMobile) {
    return (
      <Popover>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent className={cn('w-64 p-3 text-body-sm', CONTENT_CLASS)}>
          {text}
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent className={CONTENT_CLASS}>{text}</TooltipContent>
    </Tooltip>
  )
}
