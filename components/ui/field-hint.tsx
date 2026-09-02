'use client'

import { Info } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * A small "?" affordance next to a form field's label that explains, on
 * hover or keyboard focus, what the field is for.
 *
 * Rendered as a real <button> (not a bare icon) so it is reachable by
 * keyboard and announces on touch — Radix Tooltip opens on focus as well as
 * hover. The app-wide <TooltipProvider> in app/layout.tsx already supplies
 * the timing, so nothing else is needed at the call site: just drop
 * `<InfoHint text="…" />` inside an existing <Label> (which is already a
 * `flex items-center gap-2` row).
 *
 * Deliberately not on the sign-in / sign-up / password screens — those
 * fields are self-explanatory and the chrome would only add noise.
 */
export function InfoHint({ text, className }: { text: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="About this field"
          className={cn(
            'inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            className,
          )}
        >
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-pretty">{text}</TooltipContent>
    </Tooltip>
  )
}
