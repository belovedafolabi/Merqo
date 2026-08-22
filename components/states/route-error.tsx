'use client'

import { useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'

import { logger } from '@/lib/logger'
import { Button } from '@/components/ui/button'

/**
 * Shared route-level error UI, per docs/UXUI_Design_System_Specification.md
 * §49: an actionable message ("We couldn't load your products. Try again."),
 * never a raw stack trace or "Error 500." Consumed by each route segment's
 * Next.js `error.tsx` (app/error.tsx, app/(app)/error.tsx, app/(pos)/error.tsx)
 * — those files own the required `'use client'` + `reset` boundary contract;
 * this component owns the shared look and the logging call.
 */
export function RouteError({
  error,
  reset,
  title = 'Something went wrong',
  description = "We couldn't load this page. Try again, or come back in a moment.",
}: {
  error: Error & { digest?: string }
  reset: () => void
  title?: string
  description?: string
}) {
  useEffect(() => {
    logger.error('route.render_error', { message: error.message, digest: error.digest })
  }, [error])

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <TriangleAlert className="size-6" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-h4 font-semibold">{title}</p>
        <p className="max-w-sm text-body-sm text-muted-foreground">{description}</p>
      </div>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
